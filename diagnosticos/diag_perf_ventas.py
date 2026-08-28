"""
Diagnóstico de performance de /ventas/vendedor (2026-08-26).

Corre las MISMAS queries que usa la vista (las importa de ventas.py, no las
copia) y reporta:
  1. Tamaño de las tablas involucradas (filas + MB) en EVERWEAR y MAGNUS_SITD.
  2. Índices existentes en esas tablas.
  3. Tiempo de cada query (2 corridas: fría y caliente) + STATISTICS IO/TIME.
  4. Resumen del PLAN REAL: operador por operador, tabla/índice, Seek vs Scan,
     filas estimadas vs reales. (El XML completo queda en /tmp/planes/.)
  5. Índices que el propio SQL Server viene pidiendo (missing index DMV).

Cómo correr (desde donde está el docker-compose, sin rebuild):

    docker cp diag_perf_ventas.py indicadores_api:/app/diag_perf_ventas.py
    docker exec -w /app indicadores_api python diag_perf_ventas.py > diag_perf_ventas.txt 2>&1
    docker cp indicadores_api:/tmp/planes ./planes   # opcional, XML completos

Solo lee (SELECT + DMVs). No crea, no borra, no toca índices.
"""

import os
import sys
import time
import traceback
import xml.etree.ElementTree as ET

# --- localizar db.py / ventas.py ------------------------------------------
# Funciona corriendo desde cualquier cwd, y también desde un notebook (donde
# __file__ no existe). Lo que NO funciona es correrlo fuera del contenedor:
# hace falta pyodbc + el driver ODBC 18 + el ticket Kerberos montado.
_CANDIDATOS = []
try:
    _CANDIDATOS.append(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    pass
_CANDIDATOS += [
    os.getcwd(),
    "/app",
    os.path.join(os.getcwd(), "indicadores-api"),
]
for _d in _CANDIDATOS:
    if os.path.isfile(os.path.join(_d, "ventas.py")) and _d not in sys.path:
        sys.path.insert(0, _d)
        break

try:
    from db import get_connection
    import ventas as V
except ModuleNotFoundError as e:
    print(f"ERROR: no encuentro {e.name}.py (busqué en: {_CANDIDATOS})")
    print()
    print("Este script tiene que correr DENTRO del contenedor indicadores_api,")
    print("que es el único con pyodbc, el driver ODBC 18 y el ticket Kerberos:")
    print()
    print("  docker cp diag_perf_ventas.py indicadores_api:/app/diag_perf_ventas.py")
    print("  docker exec -w /app indicadores_api python diag_perf_ventas.py > diag_perf_ventas.txt 2>&1")
    print()
    print("(No sirve correrlo en un notebook ni en la PC: no hay conexión a Magnus.)")
    raise SystemExit(1)

PLANES_DIR = "/tmp/planes"
NS = "{http://schemas.microsoft.com/sqlserver/2004/07/showplan}"

TABLAS = {
    "EVERWEAR": [
        "Ven_CompCabecera",
        "Ven_CompRenglon",
        "Ven_CodCom",
        "StkFer_Articulos",
        "StkFer_ArtParamet",
        "Stk_Nivel1",
    ],
    "MAGNUS_SITD": [
        "Clientes",
        "Vendedor_Zona",
        "Ped_Usu_Arma",
    ],
}


def titulo(t):
    print("\n" + "=" * 78)
    print(t)
    print("=" * 78)


def sub(t):
    print("\n--- " + t + " " + "-" * max(0, 70 - len(t)))


# ────────────────────────────────────────────────────────────────────────────
# 1 y 2 — inventario: tamaño e índices
# ────────────────────────────────────────────────────────────────────────────

SQL_TAMANIOS = """
SELECT t.name,
       SUM(CASE WHEN p.index_id IN (0,1) THEN p.row_count ELSE 0 END)      AS filas,
       CAST(SUM(p.reserved_page_count) * 8.0 / 1024 AS DECIMAL(12,1))      AS mb
FROM sys.dm_db_partition_stats p
JOIN sys.tables t ON t.object_id = p.object_id
WHERE t.name IN ({marcas})
GROUP BY t.name
ORDER BY 2 DESC
"""

SQL_INDICES = """
SELECT t.name AS tabla,
       i.name AS indice,
       i.type_desc,
       i.is_unique,
       STUFF((SELECT ', ' + c2.name
              FROM sys.index_columns ic2
              JOIN sys.columns c2 ON c2.object_id = ic2.object_id AND c2.column_id = ic2.column_id
              WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id
                AND ic2.is_included_column = 0
              ORDER BY ic2.key_ordinal
              FOR XML PATH('')), 1, 2, '') AS claves,
       STUFF((SELECT ', ' + c3.name
              FROM sys.index_columns ic3
              JOIN sys.columns c3 ON c3.object_id = ic3.object_id AND c3.column_id = ic3.column_id
              WHERE ic3.object_id = i.object_id AND ic3.index_id = i.index_id
                AND ic3.is_included_column = 1
              ORDER BY ic3.index_column_id
              FOR XML PATH('')), 1, 2, '') AS incluidas
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
WHERE t.name IN ({marcas}) AND i.type > 0
ORDER BY t.name, i.index_id
"""

SQL_MISSING = """
SELECT TOP 20
       DB_NAME(d.database_id) AS db,
       OBJECT_NAME(d.object_id, d.database_id) AS tabla,
       CAST(s.avg_total_user_cost * s.avg_user_impact * (s.user_seeks + s.user_scans) AS DECIMAL(18,0)) AS impacto,
       s.user_seeks, s.user_scans,
       d.equality_columns, d.inequality_columns, d.included_columns
FROM sys.dm_db_missing_index_group_stats s
JOIN sys.dm_db_missing_index_groups g  ON g.index_group_handle = s.group_handle
JOIN sys.dm_db_missing_index_details d ON d.index_handle = g.index_handle
WHERE DB_NAME(d.database_id) IN ('EVERWEAR', 'MAGNUS_SITD')
ORDER BY impacto DESC
"""


def inventario():
    for db, tablas in TABLAS.items():
        marcas = ", ".join("?" for _ in tablas)
        conn = get_connection(db)
        try:
            cur = conn.cursor()
            sub(f"{db}: tamaño de tablas")
            cur.execute(SQL_TAMANIOS.format(marcas=marcas), tuple(tablas))
            print(f"{'tabla':28} {'filas':>14} {'MB':>10}")
            for nombre, filas, mb in cur.fetchall():
                print(f"{nombre:28} {int(filas or 0):>14,} {float(mb or 0):>10,.1f}")

            sub(f"{db}: índices")
            cur.execute(SQL_INDICES.format(marcas=marcas), tuple(tablas))
            for tabla, indice, tipo, uniq, claves, incl in cur.fetchall():
                u = " UNIQUE" if uniq else ""
                print(f"  {tabla}.{indice} [{tipo}{u}]")
                print(f"      claves: {claves}")
                if incl:
                    print(f"      include: {incl}")
        finally:
            conn.close()

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        sub("Índices que SQL Server viene pidiendo (missing index DMV)")
        cur.execute(SQL_MISSING)
        filas = cur.fetchall()
        if not filas:
            print("  (ninguno — la DMV se vacía en cada reinicio del servicio)")
        for db, tabla, impacto, seeks, scans, eq, ineq, inc in filas:
            print(f"  [{impacto}] {db}.{tabla}  seeks={seeks} scans={scans}")
            print(f"      =: {eq}   >: {ineq}")
            print(f"      include: {inc}")
    finally:
        conn.close()


# ────────────────────────────────────────────────────────────────────────────
# 3 y 4 — timing + plan real
# ────────────────────────────────────────────────────────────────────────────

def _drenar(cur):
    """Consume todos los result sets y devuelve (filas_del_primero, [xml...])."""
    filas = None
    planes = []
    while True:
        if cur.description:
            datos = cur.fetchall()
            if len(cur.description) == 1 and datos and isinstance(datos[0][0], str) \
               and datos[0][0].lstrip().startswith("<ShowPlanXML"):
                planes.append(datos[0][0])
            elif filas is None:
                filas = len(datos)
        if not cur.nextset():
            break
    return (filas or 0), planes


def _mensajes(cur):
    try:
        return [m[1] for m in (cur.messages or [])]
    except Exception:
        return []


def correr(nombre, sql, params):
    sub(nombre)
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")

        # --- corrida 1: fría (plan a compilar / páginas fuera de memoria)
        t0 = time.perf_counter()
        cur.execute(sql, params)
        filas, _ = _drenar(cur)
        t1 = time.perf_counter()
        print(f"  corrida 1 (fría)     : {t1 - t0:8.2f} s   filas: {filas:,}")

        # --- corrida 2: caliente
        t0 = time.perf_counter()
        cur.execute(sql, params)
        _drenar(cur)
        t2 = time.perf_counter() - t0
        print(f"  corrida 2 (caliente) : {t2:8.2f} s")

        # --- STATISTICS IO / TIME
        cur.execute("SET STATISTICS IO ON; SET STATISTICS TIME ON;")
        cur.messages  # limpia
        cur.execute(sql, params)
        _drenar(cur)
        msgs = _mensajes(cur)
        cur.execute("SET STATISTICS IO OFF; SET STATISTICS TIME OFF;")
        print("  --- STATISTICS IO / TIME ---")
        for m in msgs:
            for linea in str(m).splitlines():
                linea = linea.strip()
                if linea and not linea.startswith("[Microsoft]"):
                    print("   ", linea)
        if not msgs:
            print("    (el driver no expuso los mensajes — mirar el plan de abajo)")

        # --- plan real
        cur.execute("SET STATISTICS XML ON;")
        cur.execute(sql, params)
        _, planes = _drenar(cur)
        cur.execute("SET STATISTICS XML OFF;")
        if planes:
            os.makedirs(PLANES_DIR, exist_ok=True)
            slug = nombre.lower().replace(" ", "_").replace("/", "_")[:60]
            ruta = os.path.join(PLANES_DIR, slug + ".sqlplan")
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(planes[0])
            print(f"  --- PLAN REAL (xml completo en {ruta}) ---")
            resumen_plan(planes[0])
        else:
            print("  (no se pudo capturar el plan)")
    finally:
        conn.close()


def resumen_plan(xml):
    """Lista los operadores del plan: físico, tabla/índice, est vs real."""
    try:
        raiz = ET.fromstring(xml)
    except Exception as e:
        print("    (no se pudo parsear el plan:", e, ")")
        return

    print(f"    {'operador':34} {'objeto':44} {'est':>12} {'real':>12}")
    for rel in raiz.iter(NS + "RelOp"):
        fis = rel.get("PhysicalOp", "")
        log = rel.get("LogicalOp", "")
        est = rel.get("EstimateRows", "")
        obj = ""
        for o in rel.iter(NS + "Object"):
            t = (o.get("Table") or "").strip("[]")
            i = (o.get("Index") or "").strip("[]")
            obj = t + (f" / {i}" if i else "")
            break
        real = 0
        visto = False
        for rt in rel.iter(NS + "RunTimeCountersPerThread"):
            visto = True
            real += int(rt.get("ActualRows", 0) or 0)
        try:
            est_f = f"{float(est):,.0f}"
        except Exception:
            est_f = est
        marca = ""
        try:
            if visto and float(est) > 0 and (real / float(est) > 10 or float(est) / max(real, 1) > 10):
                marca = "  <== estimación MUY lejos"
        except Exception:
            pass
        if "Scan" in fis and obj:
            marca += "  <== SCAN"
        etiqueta = fis if fis == log else f"{fis} ({log})"
        print(f"    {etiqueta[:34]:34} {obj[:44]:44} {est_f:>12} "
              f"{(f'{real:,}' if visto else '-'):>12}{marca}")


# ────────────────────────────────────────────────────────────────────────────

def main():
    titulo("DIAGNÓSTICO DE PERFORMANCE — /ventas/vendedor")
    print("server:", os.getenv("SQL_SERVER"), " db default:", os.getenv("SQL_DATABASE"))

    desde_ym, hasta_ym, dia_desde, dia_hasta = V._resolver_rango(None, None, V.TOP_MESES)
    print(f"rango por defecto de la vista: {desde_ym[0]}-{desde_ym[1]:02d} .. "
          f"{hasta_ym[0]}-{hasta_ym[1]:02d}  (enteros Magnus {dia_desde}..{dia_hasta})")

    titulo("1-2. INVENTARIO (tamaños, índices, missing index)")
    try:
        inventario()
    except Exception:
        traceback.print_exc()

    # un vendedor real para la variante filtrada
    vend = None
    try:
        vs = V.fetch_vendedores()
        if vs:
            vend = int(vs[0].get("codigo") or vs[0].get("Codigo"))
            print(f"\nvendedor de prueba: {vs[0]}")
    except Exception:
        traceback.print_exc()

    titulo("3-4. QUERIES DE LA VISTA: tiempo + plan real")
    pruebas = [
        ("top clientes TODOS", V.SQL_TOP_CLIENTES_TODOS, (dia_desde, dia_hasta)),
        ("top lineas TODOS", V.SQL_TOP_LINEAS_TODOS, (dia_desde, dia_hasta)),
    ]
    if vend is not None:
        pruebas += [
            ("top clientes VENDEDOR", V.SQL_TOP_CLIENTES_VENDEDOR, (vend, dia_desde, dia_hasta)),
            ("top lineas VENDEDOR", V.SQL_TOP_LINEAS_VENDEDOR, (vend, dia_desde, dia_hasta)),
        ]
    for nombre, sql, params in pruebas:
        try:
            correr(nombre, sql, params)
        except Exception:
            traceback.print_exc()

    titulo("FIN")


if __name__ == "__main__":
    main()

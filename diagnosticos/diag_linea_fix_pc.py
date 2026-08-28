"""
clientes-por-linea: probar 3 formas de la MISMA consulta y comparar
tiempo + resultado (pc-013, 2026-08-26).

Hallazgo que motiva esto (plan real de la query actual):
  - `Ven_CompRenglon` se lee con Clustered Index Scan: 385.232 filas para
    quedarse con 3.896. La tabla tiene 3,1 M.
  - `Ven_CompCabecera` hace 90.697 Clustered Index Seek (key lookups) sobre
    una tabla de 7,5 GB.
  - PRECINTOS son ~40 artículos. Existe el índice
    `V_REN_Cla_Articu (CodArticu, FecMovim)` que permitiría ir directo.

Variantes:
  A = la de producción, tal cual.
  B = A + `r.FecMovim BETWEEN ? AND ?` (el renglón TAMBIÉN tiene fecha).
  C = resolver primero los artículos de la línea y arrancar por
      Ven_CompRenglon con seek por (CodArticu, FecMovim).

Antes de medir, verifica si `r.FecMovim` coincide con `vc.FecMovim` — si no
coincidiera, B y C estarían mal y hay que descartarlas.
Al final compara los resultados de las 3: si no dan idéntico, lo dice.

    cd C:\\Users\\cabralp\\Desktop\\projects\\vicki\\vicki_web\\indicadores-api
    export EVERWEAR_ADMIN_PWD='...'
    python diag_linea_fix_pc.py > diag_linea_fix_pc.txt 2>&1

Opcional: `python diag_linea_fix_pc.py "OTRA LINEA"`.
Solo lee. No crea nada en la base.
"""

import os
import sys
import time
import types
import calendar
import traceback
from datetime import date

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

LINEA = sys.argv[1] if len(sys.argv) > 1 else "PRECINTOS"
SERVER = os.getenv("SQL_SERVER", "10.10.0.235")

_CAND = []
try:
    _CAND.append(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    pass
_CAND += [os.getcwd(),
          os.path.join(os.getcwd(), "indicadores-api"),
          r"C:\Users\cabralp\Desktop\projects\vicki\vicki_web\indicadores-api"]
BASE = None
for _d in _CAND:
    if os.path.isfile(os.path.join(_d, "ventas.py")):
        BASE = _d
        if _d not in sys.path:
            sys.path.insert(0, _d)
        break
if BASE is None:
    print("ERROR: no encuentro ventas.py. Correlo parado en indicadores-api.")
    raise SystemExit(1)
print(f"repo: {BASE}")

try:
    import dotenv  # noqa: F401
except ImportError:
    m = types.ModuleType("dotenv")
    m.load_dotenv = lambda *a, **k: None
    sys.modules["dotenv"] = m

import pyodbc  # noqa: E402


def _driver():
    for pref in ("ODBC Driver 18 for SQL Server",
                 "ODBC Driver 17 for SQL Server",
                 "SQL Server Native Client 11.0",
                 "SQL Server"):
        if pref in pyodbc.drivers():
            return pref
    raise RuntimeError(f"no hay driver ODBC. Instalados: {pyodbc.drivers()}")


DRIVER = _driver()
_IMPERSONADO = False


def _impersonar():
    global _IMPERSONADO
    pwd = os.getenv("EVERWEAR_ADMIN_PWD")
    if not pwd or _IMPERSONADO:
        return False
    import win32con
    import win32security
    h = win32security.LogonUser("administrador", "EVERWEAR", pwd,
                                win32con.LOGON32_LOGON_NEW_CREDENTIALS,
                                win32con.LOGON32_PROVIDER_DEFAULT)
    win32security.ImpersonateLoggedOnUser(h)
    _IMPERSONADO = True
    print("(impersonando EVERWEAR\\administrador)")
    return True


def conectar(database="EVERWEAR"):
    cs = (f"DRIVER={{{DRIVER}}};SERVER={SERVER};DATABASE={database};"
          "Trusted_Connection=yes;")
    if DRIVER.startswith("ODBC Driver 1"):
        cs += "TrustServerCertificate=yes;"
    try:
        return pyodbc.connect(cs)
    except pyodbc.Error:
        if _impersonar():
            return pyodbc.connect(cs)
        raise


import ventas as V  # noqa: E402

BASE_DATE = V.BASE_DATE
ANIO_ACT = date.today().year
ANIOS = (ANIO_ACT - 1, ANIO_ACT)
D1 = (date(ANIOS[0], 1, 1) - BASE_DATE).days
D2 = (date(ANIOS[1], 12, calendar.monthrange(ANIOS[1], 12)[1]) - BASE_DATE).days
CASE_VC = V._case_anio_mes(ANIOS, "vc.FecMovim")

COND_LINEA = ("ap.Nivel1 IN (SELECT n.Nivel1 FROM Stk_Nivel1 n "
              "WHERE LTRIM(RTRIM(n.Detalle)) = ?)")

# ── A: la de producción ────────────────────────────────────────────────────
SQL_A = f"""
SELECT CodCliente, AnioMes, SUM(Cant) AS Cant, SUM(Monto) AS Monto
FROM (
SELECT c.CodCliente AS CodCliente,
       {CASE_VC} AS AnioMes,
       CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END AS Cant,
       CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END AS Monto
FROM MAGNUS_SITD.dbo.Clientes c
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
LEFT JOIN StkFer_Articulos  s  ON s.CodArticulo    = r.CodArticu
LEFT JOIN StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
  AND {COND_LINEA}
) t
WHERE AnioMes IS NOT NULL
GROUP BY CodCliente, AnioMes
"""
PAR_A = (D1, D2, LINEA)

# ── B: igual, pero acotando también por la fecha del RENGLÓN ───────────────
SQL_B = SQL_A.replace(
    "  AND vc.FecMovim BETWEEN ? AND ?",
    "  AND vc.FecMovim BETWEEN ? AND ?\n  AND r.FecMovim BETWEEN ? AND ?",
)
PAR_B = (D1, D2, D1, D2, LINEA)

# ── C: arrancar por los artículos de la línea (seek por CodArticu+FecMovim) ─
SQL_C = f"""
SELECT CodCliente, AnioMes, SUM(Cant) AS Cant, SUM(Monto) AS Monto
FROM (
SELECT vc.CodCliente AS CodCliente,
       {CASE_VC} AS AnioMes,
       CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END AS Cant,
       CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END AS Monto
FROM (
    SELECT s.CodArticulo
    FROM StkFer_ArtParamet ap
    JOIN StkFer_Articulos s ON s.ArticuloPatron = ap.ArticuloPatron
    WHERE {COND_LINEA}
) a
JOIN Ven_CompRenglon r   ON r.CodArticu   = a.CodArticulo
JOIN Ven_CompCabecera vc ON vc.NroMovVenta = r.NroMovVenta
JOIN Ven_CodCom cc       ON cc.CompCodigo  = vc.CompCodigo
WHERE r.FecMovim  BETWEEN ? AND ?
  AND vc.FecMovim BETWEEN ? AND ?
  AND cc.EvitaInformesYListados <> 1
) t
WHERE AnioMes IS NOT NULL
GROUP BY CodCliente, AnioMes
"""
PAR_C = (LINEA, D1, D2, D1, D2)

# nombre del cliente: en C se resuelve aparte (1 query chica) para no arrastrar
# el Table Scan de MAGNUS_SITD.Clientes dentro de la agregación.

SQL_COHERENCIA = """
SELECT TOP 1
    SUM(CASE WHEN r.FecMovim = vc.FecMovim THEN 1 ELSE 0 END) AS iguales,
    SUM(CASE WHEN r.FecMovim <> vc.FecMovim THEN 1 ELSE 0 END) AS distintas,
    MIN(r.FecMovim - vc.FecMovim) AS dif_min,
    MAX(r.FecMovim - vc.FecMovim) AS dif_max
FROM Ven_CompCabecera vc
JOIN Ven_CompRenglon r ON r.NroMovVenta = vc.NroMovVenta
WHERE vc.FecMovim BETWEEN ? AND ?
"""


def correr(conn, etiqueta, sql, params, veces=2):
    cur = conn.cursor()
    tiempos = []
    filas = None
    for _ in range(veces):
        t0 = time.perf_counter()
        cur.execute(sql, params)
        filas = cur.fetchall()
        tiempos.append(time.perf_counter() - t0)
    res = {}
    for cod, am, cant, monto in filas:
        if cod is None or am is None:
            continue
        res[(int(cod), int(am))] = (round(float(cant or 0), 2),
                                    round(float(monto or 0), 2))
    print(f"  {etiqueta:14} {tiempos[0]:7.2f} s / {tiempos[-1]:7.2f} s   "
          f"{len(filas):,} filas   {len(set(k[0] for k in res)):,} clientes")
    return res, min(tiempos)


def plan(conn, etiqueta, sql, params):
    print(f"\n--- PLAN de {etiqueta} ---")
    cur = conn.cursor()
    try:
        cur.execute("SET STATISTICS PROFILE ON;")
        cur.execute(sql, params)
        capturado = None
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                f = cur.fetchall()
                if "StmtText" in cols:
                    capturado = (cols, f)
            if not cur.nextset():
                break
        cur.execute("SET STATISTICS PROFILE OFF;")
        if not capturado:
            print("  (sin plan)")
            return
        cols, f = capturado
        ix = {c: i for i, c in enumerate(cols)}
        print(f"  {'filas':>12} {'ejec':>7} {'est':>12}  operador")
        for fila in f:
            txt = (fila[ix["StmtText"]] or "").rstrip()
            sang = len(txt) - len(txt.lstrip())
            txt = " " * min(sang, 20) + txt.strip()
            try:
                rows = f"{int(fila[ix['Rows']]):,}"
            except Exception:
                rows = str(fila[ix.get("Rows", 0)])
            try:
                est = f"{float(fila[ix['EstimateRows']]):,.0f}"
            except Exception:
                est = ""
            marca = "   <== SCAN" if ("Scan" in txt and "Seek" not in txt) else ""
            print(f"  {rows:>12} {str(fila[ix.get('Executes', 0)]):>7} {est:>12}  {txt[:130]}{marca}")
    except Exception:
        traceback.print_exc()


def comparar(nombre, a, b):
    if a == b:
        print(f"  {nombre}: IDÉNTICO ✔")
        return
    faltan = set(a) - set(b)
    sobran = set(b) - set(a)
    difs = [k for k in (set(a) & set(b)) if a[k] != b[k]]
    print(f"  {nombre}: DISTINTO ✘  faltan={len(faltan)} sobran={len(sobran)} "
          f"valores_distintos={len(difs)}")
    for k in list(faltan)[:3]:
        print(f"     solo en A: {k} -> {a[k]}")
    for k in list(sobran)[:3]:
        print(f"     solo en la otra: {k} -> {b[k]}")
    for k in difs[:3]:
        print(f"     {k}: A={a[k]}  otra={b[k]}")


def main():
    print("=" * 78)
    print(f"clientes-por-linea — 3 variantes — línea '{LINEA}'")
    print(f"rango: {ANIOS[0]}-01-01 .. {ANIOS[1]}-12-31  (enteros {D1}..{D2})")
    print("=" * 78)

    conn = conectar("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")

        print("\n--- 0. ¿r.FecMovim coincide con vc.FecMovim? ---")
        cur.execute(SQL_COHERENCIA, (D1, D2))
        ig, di, dmin, dmax = cur.fetchone()
        print(f"  iguales: {int(ig or 0):,}   distintas: {int(di or 0):,}   "
              f"dif min/max: {dmin} / {dmax}")
        if di:
            print("  OJO: no siempre coinciden — B y C pueden perder filas.")

        print("\n--- 1. Tiempos (1ª corrida / 2ª corrida) ---")
        ra, ta = correr(conn, "A producción", SQL_A, PAR_A)
        rb, tb = correr(conn, "B +fecha reng", SQL_B, PAR_B)
        rc, tc = correr(conn, "C por artícu", SQL_C, PAR_C)

        print("\n--- 2. ¿Dan lo mismo? ---")
        comparar("B vs A", ra, rb)
        comparar("C vs A", ra, rc)

        print("\n--- 3. Mejora ---")
        for nombre, t in (("B", tb), ("C", tc)):
            if t > 0:
                print(f"  {nombre}: {ta:.2f} s -> {t:.2f} s   ({ta / t:.1f}x)")

        mejor = min((ta, "A", SQL_A, PAR_A), (tb, "B", SQL_B, PAR_B),
                    (tc, "C", SQL_C, PAR_C), key=lambda x: x[0])
        if mejor[1] != "A":
            plan(conn, f"la variante {mejor[1]} (la más rápida)", mejor[2], mejor[3])
    finally:
        conn.close()
    print("\n" + "=" * 78)


if __name__ == "__main__":
    main()

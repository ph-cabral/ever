"""
Facturación del día (Magnus, SOLO LECTURA).

Para el widget "calculadora de facturación":
  · ENTRA  → comprobantes con código 11               (suma)
  · SALE   → comprobantes con código 22, 23, 24 y 25   (resta: NC / devoluciones)
  · NETO   → entra − sale.  Se devuelve con IVA y sin IVA (21%).

Patrón idéntico a compras.py: a Magnus NUNCA se le escribe, sólo se lee en vivo.

────────────────────────────────────────────────────────────────────────────
TABLA CONFIRMADA: EVERWEAR.dbo.Ven_CompCabecera (descubrimiento 2026-06-26).
Si cambia el esquema, re-descubrir con descubrir_facturacion.sql o el endpoint
GET /finanza/descubrir y ajustar el bloque CONFIG de abajo.
────────────────────────────────────────────────────────────────────────────
"""
from datetime import datetime, date
from decimal import Decimal
from db import get_connection
from db_pg import get_pg_connection
from deposito import OT_COL_PEDIDO

BASE_DATE = date(1800, 12, 28)   # Magnus guarda fechas como días desde esta base

# ── Códigos de comprobante (los pidió contaduría) ────────────────────────────
COD_SUMA  = (11,)                 # lo que ENTRA
COD_RESTA = (13, 22, 23, 24, 25)  # lo que SALE (13 + notas de crédito / devoluciones)
IVA_RATE  = 0.21                  # para el "neto sin IVA"

# ── CONFIG — CONFIRMADO POR DESCUBRIMIENTO (Ven_CompCabecera) ────────────────
# Tabla de cabecera de comprobantes de venta. CompCodigo: 11=FACTURA CTA.CTE.
# MAYORISTA (suma); 22..25 = notas de crédito (resta). FecMovim = entero Magnus
# (días desde 1800-12-28; hoy 2026-06-26 = 82360). Total = total CON IVA;
# TasaIVA viene por fila (0 en bonificaciones) → se netea comprobante por
# comprobante. Verificar con: VW_Ven_CompCabecera / descubrir_facturacion.sql.
FACT_DB          = "EVERWEAR"            # base
FACT_TABLA       = "Ven_CompCabecera"    # cabecera de comprobantes de venta
COL_CODIGO       = "CompCodigo"          # tipo de comprobante (11 / 22 / 23 / 24 / 25)
COL_IMPORTE      = "Neto"                # importe del comprobante (columna Neto)
COL_FECHA        = "FecMovim"            # entero Magnus (días desde 1800-12-28)
FECHA_ES_ENTERO  = True                  # FecMovim es entero
COL_IVA          = ""                    # IVA no se toma
COL_TASA_IVA     = ""                    # TasaIVA vino 0 en toda la tabla; no se usa
COL_NETO         = "Neto"                # se suma/resta la columna Neto directa (sin cálculo de IVA)
# ─────────────────────────────────────────────────────────────────────────────

CONFIGURADO = bool(FACT_TABLA and COL_CODIGO and COL_IMPORTE and COL_FECHA)


def _safe(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", "ignore")
    return value


def _hoy_entero() -> int:
    return (date.today() - BASE_DATE).days


def _filtro_fecha_sql(param: str = "?") -> str:
    """Cláusula para 'el día' según el tipo de la columna de fecha."""
    if FECHA_ES_ENTERO:
        return f"{COL_FECHA} = {param}"
    return f"CAST({COL_FECHA} AS date) = {param}"


def _valor_fecha(dia: date):
    return (dia - BASE_DATE).days if FECHA_ES_ENTERO else dia.isoformat()


# ── 1) FACTURACIÓN DEL DÍA ───────────────────────────────────────────────────
def fetch_facturacion_dia(fecha: str | None = None) -> dict:
    """Entra (cód 11) − Sale (cód 22..25) del día. Neto con y sin IVA.
    `fecha` = 'YYYY-MM-DD' (default: hoy)."""
    dia = datetime.strptime(fecha, "%Y-%m-%d").date() if fecha else date.today()

    if not CONFIGURADO:
        # Todavía no sabemos la tabla: respondemos algo sano para que el widget
        # muestre "pendiente" en lugar de romper. Ver descubrir_facturacion.sql.
        return {
            "configurado": False,
            "fecha": dia.isoformat(),
            "entra": 0.0, "sale": 0.0,
            "neto_con_iva": 0.0, "neto_sin_iva": 0.0,
            "cantidad": 0,
            "mensaje": "Falta configurar la tabla de facturación en finanza.py "
                       "(usar /finanza/descubrir o descubrir_facturacion.sql).",
        }

    # NETO de cada fila (sin IVA), por orden de preferencia:
    #  1) COL_NETO     → columna de neto gravado puro (excluye NoGravado);
    #  2) COL_IVA      → Total − IVA  (exacto: saca sólo el IVA real del comprobante;
    #                    si IVA=0, p.ej. bonificaciones, el importe queda entero);
    #  3) COL_TASA_IVA → Total / (1 + tasa)  (la tasa puede venir 21 ó 0.21);
    #  4) si no hay nada, /1.21 plano.
    if COL_NETO:
        neto_expr = COL_NETO
        metodo = "columna-neto-gravado"
    elif COL_IVA:
        neto_expr = f"({COL_IMPORTE} - {COL_IVA})"
        metodo = "total-menos-iva"
    elif COL_TASA_IVA:
        neto_expr = (f"({COL_IMPORTE} / (1 + CASE WHEN {COL_TASA_IVA} > 1 "
                     f"THEN {COL_TASA_IVA} / 100.0 ELSE {COL_TASA_IVA} END))")
        metodo = "tasa-iva-por-fila"
    else:
        neto_expr = f"({COL_IMPORTE} / {1.0 + IVA_RATE})"
        metodo = "iva-21-plano"

    codes_suma  = ",".join(str(c) for c in COD_SUMA)
    codes_resta = ",".join(str(c) for c in COD_RESTA)
    codes_all   = ",".join(str(c) for c in (*COD_SUMA, *COD_RESTA))

    sql = f"""
    SELECT
        SUM(CASE WHEN {COL_CODIGO} IN ({codes_suma})  THEN {COL_IMPORTE} ELSE 0 END) AS entra_con_iva,
        SUM(CASE WHEN {COL_CODIGO} IN ({codes_resta}) THEN {COL_IMPORTE} ELSE 0 END) AS sale_con_iva,
        SUM(CASE WHEN {COL_CODIGO} IN ({codes_suma})  THEN {neto_expr} ELSE 0 END) AS entra_neto,
        SUM(CASE WHEN {COL_CODIGO} IN ({codes_resta}) THEN {neto_expr} ELSE 0 END) AS sale_neto,
        COUNT(*) AS cantidad
    FROM {FACT_DB}.dbo.{FACT_TABLA}
    WHERE {COL_CODIGO} IN ({codes_all})
      AND {_filtro_fecha_sql('?')}
    """

    conn = get_connection(FACT_DB)
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(sql, _valor_fecha(dia))
        row = cur.fetchone()
    finally:
        conn.close()

    entra_con_iva = float(_safe(row[0]) or 0) if row else 0.0
    sale_con_iva  = float(_safe(row[1]) or 0) if row else 0.0
    entra_neto    = float(_safe(row[2]) or 0) if row else 0.0
    sale_neto     = float(_safe(row[3]) or 0) if row else 0.0
    cantidad      = int(row[4]) if row and row[4] is not None else 0

    neto_con_iva = entra_con_iva - sale_con_iva
    neto_sin_iva = entra_neto - sale_neto

    # Ajuste manual (Postgres finanza.ajuste_manual) — ventas reales que no
    # generaron comprobante en Magnus (ver ever/sql/finanza_ajuste_manual.sql,
    # caso Todo Goma 30/07/2026). Si Postgres no responde, no rompe la
    # facturación de Magnus: el ajuste queda en 0 y se avisa en "mensaje".
    ajuste_neto, ajuste_total, ajuste_error = 0.0, 0.0, None
    try:
        ajuste = fetch_ajuste_manual_total(dia)
        ajuste_neto = ajuste["neto"]
        ajuste_total = ajuste["total"]
    except Exception as e:
        ajuste_error = str(e)

    neto_sin_iva += ajuste_neto
    neto_con_iva += ajuste_total if ajuste_total else ajuste_neto

    out = {
        "configurado": True,
        "fecha": dia.isoformat(),
        "entra": round(entra_con_iva),
        "sale": round(sale_con_iva),
        "neto_con_iva": round(neto_con_iva),
        "neto_sin_iva": round(neto_sin_iva),
        "cantidad": cantidad,
        "iva_rate": IVA_RATE,
        "metodo_neto": metodo,
        "codigos": {"suma": list(COD_SUMA), "resta": list(COD_RESTA)},
        "ajuste_manual": round(ajuste_neto),
    }
    if ajuste_error:
        out["ajuste_manual_error"] = ajuste_error
    return out


# ── 1b) AJUSTE MANUAL (Postgres) — ventas reales sin comprobante en Magnus ───
def fetch_ajuste_manual_total(dia: date) -> dict:
    """SUM(neto)/SUM(total) de finanza.ajuste_manual para `dia`. {0,0} si no
    hay ninguno cargado ese día."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COALESCE(SUM(neto), 0), COALESCE(SUM(total), 0) "
            "FROM finanza.ajuste_manual WHERE fecha = %s",
            (dia,),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    return {"neto": float(row[0] or 0), "total": float(row[1] or 0)}


def insert_ajuste_manual(
    fecha: str,
    neto: float,
    iva: float | None = None,
    total: float | None = None,
    cod_cliente: int | None = None,
    cliente_nombre: str | None = None,
    comprobante: str | None = None,
    motivo: str | None = None,
    usuario: str | None = None,
) -> dict:
    """Alta de un ajuste manual (venta real sin comprobante en Magnus).
    `fecha` = 'YYYY-MM-DD'. `neto` es obligatorio (lo que suma el widget);
    iva/total son opcionales para trazabilidad."""
    dia = datetime.strptime(fecha, "%Y-%m-%d").date()
    if neto is None:
        raise ValueError("Falta 'neto'")

    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO finanza.ajuste_manual
                (fecha, neto, iva, total, cod_cliente, cliente_nombre,
                 comprobante, motivo, usuario)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (dia, neto, iva, total, cod_cliente, cliente_nombre,
             comprobante, motivo, usuario),
        )
        new_id, created_at = cur.fetchone()
        conn.commit()
    finally:
        conn.close()

    return {
        "id": new_id,
        "fecha": dia.isoformat(),
        "neto": float(neto),
        "iva": float(iva) if iva is not None else None,
        "total": float(total) if total is not None else None,
        "codCliente": cod_cliente,
        "clienteNombre": cliente_nombre,
        "comprobante": comprobante,
        "motivo": motivo,
        "usuario": usuario,
        "createdAt": created_at.isoformat(),
    }


def fetch_ajuste_manual_list(desde: str | None = None, hasta: str | None = None) -> list[dict]:
    """Lista de finanza.ajuste_manual, filtro opcional por rango de fecha."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        where, params = [], []
        if desde:
            where.append("fecha >= %s")
            params.append(desde)
        if hasta:
            where.append("fecha <= %s")
            params.append(hasta)
        sql = (
            "SELECT id, fecha, neto, iva, total, cod_cliente, cliente_nombre, "
            "comprobante, motivo, usuario, created_at FROM finanza.ajuste_manual"
        )
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY fecha DESC, created_at DESC"
        cur.execute(sql, params)
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    for r in rows:
        r["fecha"] = r["fecha"].isoformat() if r.get("fecha") else None
        r["created_at"] = r["created_at"].isoformat() if r.get("created_at") else None
        for campo in ("neto", "iva", "total"):
            if r.get(campo) is not None:
                r[campo] = float(r[campo])
    return rows


# ── 2) DESCUBRIMIENTO (para encontrar la tabla "juntos" sin SSMS) ─────────────
SQL_CODIGOS = """
SELECT * FROM MAGNUS_SITD.dbo.Ven_CodComprobante
WHERE CompCodigo IN (11,22,23,24,25) ORDER BY CompCodigo
"""

# NOTA: EVERWEAR y MAGNUS_SITD tienen collations distintas; el UNION ALL lleva
# COLLATE DATABASE_DEFAULT en las columnas de texto para evitar el error
# "No se puede resolver el conflicto de intercalación".
SQL_TABLAS = """
SELECT 'EVERWEAR' AS base, t.TABLE_NAME COLLATE DATABASE_DEFAULT AS TABLE_NAME
FROM EVERWEAR.INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE='BASE TABLE' AND (
   t.TABLE_NAME LIKE '%Comprob%' OR t.TABLE_NAME LIKE '%Factur%' OR
   t.TABLE_NAME LIKE '%MovVent%' OR t.TABLE_NAME LIKE '%Vta%'    OR
   t.TABLE_NAME LIKE '%Venta%'   OR t.TABLE_NAME LIKE '%Caja%')
UNION ALL
SELECT 'MAGNUS_SITD' AS base, t.TABLE_NAME COLLATE DATABASE_DEFAULT
FROM MAGNUS_SITD.INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE='BASE TABLE' AND (
   t.TABLE_NAME LIKE '%Comprob%' OR t.TABLE_NAME LIKE '%Factur%' OR
   t.TABLE_NAME LIKE '%MovVent%' OR t.TABLE_NAME LIKE '%Vta%'    OR
   t.TABLE_NAME LIKE '%Venta%'   OR t.TABLE_NAME LIKE '%Caja%')
ORDER BY base, TABLE_NAME
"""

# Tablas con (código de comprobante) + (importe) + (fecha) a la vez.
SQL_PISTAS = """
;WITH cols AS (
    SELECT 'EVERWEAR' AS base, TABLE_NAME COLLATE DATABASE_DEFAULT AS TABLE_NAME,
           COLUMN_NAME COLLATE DATABASE_DEFAULT AS COLUMN_NAME
    FROM EVERWEAR.INFORMATION_SCHEMA.COLUMNS
    UNION ALL
    SELECT 'MAGNUS_SITD' AS base, TABLE_NAME COLLATE DATABASE_DEFAULT,
           COLUMN_NAME COLLATE DATABASE_DEFAULT
    FROM MAGNUS_SITD.INFORMATION_SCHEMA.COLUMNS
)
SELECT c.base, c.TABLE_NAME,
   MAX(CASE WHEN c.COLUMN_NAME LIKE '%CompCodigo%' OR c.COLUMN_NAME LIKE '%TipoComp%'
             OR c.COLUMN_NAME LIKE '%CodComp%'    OR c.COLUMN_NAME LIKE '%Comprob%'
            THEN c.COLUMN_NAME END) AS col_codigo,
   MAX(CASE WHEN c.COLUMN_NAME LIKE '%Importe%' OR c.COLUMN_NAME LIKE '%Total%'
             OR c.COLUMN_NAME LIKE '%Neto%'     OR c.COLUMN_NAME LIKE '%Gravado%'
            THEN c.COLUMN_NAME END) AS col_importe,
   MAX(CASE WHEN c.COLUMN_NAME LIKE '%IVA%'   THEN c.COLUMN_NAME END) AS col_iva,
   MAX(CASE WHEN c.COLUMN_NAME LIKE '%Fecha%' OR c.COLUMN_NAME LIKE '%Fec%'
            THEN c.COLUMN_NAME END) AS col_fecha
FROM cols c
GROUP BY c.base, c.TABLE_NAME
HAVING MAX(CASE WHEN c.COLUMN_NAME LIKE '%CompCodigo%' OR c.COLUMN_NAME LIKE '%TipoComp%'
                 OR c.COLUMN_NAME LIKE '%CodComp%'    OR c.COLUMN_NAME LIKE '%Comprob%'
                THEN 1 END) = 1
   AND MAX(CASE WHEN c.COLUMN_NAME LIKE '%Importe%' OR c.COLUMN_NAME LIKE '%Total%'
                 OR c.COLUMN_NAME LIKE '%Neto%'     OR c.COLUMN_NAME LIKE '%Gravado%'
                THEN 1 END) = 1
ORDER BY c.base, c.TABLE_NAME
"""


def _rows(cur) -> list[dict]:
    cols = [c[0] for c in cur.description]
    return [{c: _safe(v) for c, v in zip(cols, r)} for r in cur.fetchall()]


def fetch_descubrir() -> dict:
    """Introspección de Magnus para ubicar la tabla de facturación.
    Devuelve: qué son los códigos, tablas candidatas y tablas con las 3 pistas."""
    conn = get_connection(FACT_DB)
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        out = {"configurado": CONFIGURADO}
        for clave, sql in (("codigos", SQL_CODIGOS),
                           ("tablas_candidatas", SQL_TABLAS),
                           ("tablas_con_pistas", SQL_PISTAS)):
            try:
                cur.execute(sql)
                out[clave] = _rows(cur)
            except Exception as e:
                out[clave] = {"error": str(e)}
        return out
    finally:
        conn.close()


# ── 3) PRESUPUESTOS "FANTASMA" — descubrimiento del origen real ──────────────
# Caso disparador (2026-07-31): Todo Goma (CodCliente 5226), presupuesto
# Ctrl. A 0002-00041879 del 30/07/2026, $3.790.526,47 — YA CONFIRMADO que no
# existe en Ven_CompCabecera, VenFer_PedidoCabecera ni EVERWEAR.dbo.Pre_PresupCab
# (se buscó por número impreso, por fecha+total y en el listado completo del
# día — 0 coincidencias en las 3). O sea: ni siquiera Pre_PresupCab (el
# candidato obvio) es el origen real de la pantalla "COMPROBANTES (Facturas /
# Créditos Devolución)" cuando el Código Comprobante = 11 (PRESUP.).
#
# El mismo día ese cliente imprimió 13 presupuestos entre las 14:44 y las
# 17:31 (comprobantes 41868-41871, 41873-41876, 41878-41882), todos por
# montos millonarios — 41879 es sólo uno de esa tanda. Antes de poder sumar
# nada de esto al widget de facturación hay que:
#   1) encontrar la tabla real detrás de esa pantalla (fetch_descubrir_presupuestos)
#   2) confirmar, uno por uno, cuáles de los 13 son huérfanos de verdad
#      (fetch_verificar_presupuestos) — puede que sean simples reimpresiones
#      de un mismo presupuesto en negociación y sólo la última cuente.
SQL_PRESUP_SCHEMA = """
SELECT 'EVERWEAR' AS base, TABLE_NAME COLLATE DATABASE_DEFAULT AS TABLE_NAME,
       COLUMN_NAME COLLATE DATABASE_DEFAULT AS COLUMN_NAME,
       DATA_TYPE COLLATE DATABASE_DEFAULT AS DATA_TYPE
FROM EVERWEAR.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME LIKE '%Presup%'
UNION ALL
SELECT 'MAGNUS_SITD', TABLE_NAME COLLATE DATABASE_DEFAULT,
       COLUMN_NAME COLLATE DATABASE_DEFAULT, DATA_TYPE COLLATE DATABASE_DEFAULT
FROM MAGNUS_SITD.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME LIKE '%Presup%'
ORDER BY base, TABLE_NAME, COLUMN_NAME
"""

# Búsqueda ampliada: si ni Pre_PresupCab tiene el registro, puede que la
# pantalla lea de una tabla de "documentos impresos" / cotizaciones con otro
# nombre. Mismas 2 bases que SQL_TABLAS de arriba.
SQL_PRESUP_TABLAS_AMPLIO = """
SELECT 'EVERWEAR' AS base, t.TABLE_NAME COLLATE DATABASE_DEFAULT AS TABLE_NAME
FROM EVERWEAR.INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE' AND (
   t.TABLE_NAME LIKE '%Presup%' OR t.TABLE_NAME LIKE '%Cotiz%' OR
   t.TABLE_NAME LIKE '%Impres%' OR t.TABLE_NAME LIKE '%Doc%')
UNION ALL
SELECT 'MAGNUS_SITD', t.TABLE_NAME COLLATE DATABASE_DEFAULT
FROM MAGNUS_SITD.INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE' AND (
   t.TABLE_NAME LIKE '%Presup%' OR t.TABLE_NAME LIKE '%Cotiz%' OR
   t.TABLE_NAME LIKE '%Impres%' OR t.TABLE_NAME LIKE '%Doc%')
ORDER BY base, TABLE_NAME
"""


def fetch_descubrir_presupuestos() -> dict:
    """Introspección para encontrar el origen real de la pantalla de
    presupuestos (Pre_PresupCab ya se descartó para el caso 41879). Devuelve
    columnas reales de toda tabla %Presup% + tablas candidatas ampliadas
    (Presup/Cotiz/Impres/Doc) en EVERWEAR y MAGNUS_SITD."""
    conn = get_connection(FACT_DB)
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        out = {}
        for clave, sql in (("columnas_presup", SQL_PRESUP_SCHEMA),
                           ("tablas_candidatas", SQL_PRESUP_TABLAS_AMPLIO)):
            try:
                cur.execute(sql)
                out[clave] = _rows(cur)
            except Exception as e:
                out[clave] = {"error": str(e)}
        return out
    finally:
        conn.close()


# ── 4) Verificación de presupuestos "huérfanos" (cliente+fecha+total) ───────
# NO se busca por número impreso (A-0002-000XXXXX): ese formato no
# correlaciona 1:1 con ninguna columna confirmada — así se descartó el 41879
# (búsqueda por número, por fecha+total y en el listado completo del día).
# Esta función repite ESE MISMO método para una lista completa de una sola vez:
#   1) Ven_CompCabecera: FecMovim + Neto (tolerancia $1). CodCliente en esta
#      tabla NO está confirmado en el código — si la columna no existe, esa
#      pata queda marcada con el error de SQL en vez de romper todo el batch.
#   2) VenFer_PedidoCabecera + VenFer_PedidoReng: mismo CodCliente+FechaPedido,
#      sumando renglones (CantidadPedida * PrecioVenta), tolerancia $1.
def fetch_verificar_presupuestos(items: list[dict]) -> list[dict]:
    """items: [{"comprobante": "A-0002-00041878", "cod_cliente": 5226,
                "fecha": "2026-07-30", "total": 12699183.44}, ...]
    Devuelve, por cada item, si aparece en Ven_CompCabecera y/o en
    VenFer_PedidoCabecera. "huerfano_probable"=True si no aparece en ninguna
    (mismo resultado que dio el 41879 antes de cargarlo como ajuste manual)."""
    conn = get_connection(FACT_DB)
    out = []
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        for it in items:
            comprobante = it.get("comprobante")
            cod_cliente = it.get("cod_cliente")
            fecha = datetime.strptime(str(it["fecha"])[:10], "%Y-%m-%d").date()
            total = float(it["total"])
            f_int = (fecha - BASE_DATE).days

            resultado = {
                "comprobante": comprobante,
                "cod_cliente": cod_cliente,
                "fecha": fecha.isoformat(),
                "total": total,
                "en_ven_compcabecera": None,
                "en_venfer_pedido": None,
            }

            # 1) Ven_CompCabecera: FecMovim + Neto (± $1)
            try:
                cur.execute(
                    f"SELECT COUNT(*) FROM {FACT_DB}.dbo.{FACT_TABLA} "
                    f"WHERE {COL_FECHA} = ? AND ABS({COL_IMPORTE} - ?) < 1",
                    (f_int, total),
                )
                resultado["en_ven_compcabecera"] = cur.fetchone()[0] > 0
            except Exception as e:
                resultado["en_ven_compcabecera"] = f"error: {e}"

            # 2) VenFer_PedidoCabecera + Reng: mismo cliente+día, suma de
            # renglones dentro de $1 del total buscado
            try:
                cur.execute(
                    """
                    SELECT cab.NroMovVenta,
                           SUM(r.CantidadPedida * r.PrecioVenta) AS Total
                    FROM EVERWEAR.dbo.VenFer_PedidoCabecera cab
                    JOIN EVERWEAR.dbo.VenFer_PedidoReng r ON r.NroMovVenta = cab.NroMovVenta
                    WHERE cab.CodCliente = ? AND cab.FechaPedido = ?
                    GROUP BY cab.NroMovVenta
                    HAVING ABS(SUM(r.CantidadPedida * r.PrecioVenta) - ?) < 1
                    """,
                    (cod_cliente, f_int, total),
                )
                filas = cur.fetchall()
                resultado["en_venfer_pedido"] = [int(r[0]) for r in filas] or False
            except Exception as e:
                resultado["en_venfer_pedido"] = f"error: {e}"

            resultado["huerfano_probable"] = (
                resultado["en_ven_compcabecera"] is False
                and resultado["en_venfer_pedido"] is False
            )
            out.append(resultado)
        return out
    finally:
        conn.close()


# ── 5) Pedidos despachados por WMS pero sin factura en Magnus (100% automático)
# Distinto del caso Todo Goma/41879: ahí el presupuesto NUNCA llegó a ser
# pedido (VenFer_PedidoCabecera) — no hay ningún rastro en ningún sistema, así
# que ninguna consulta puede confirmar solo si era plata real o una cotización
# que no se cerró (eso lo sabe Pablo, no la base). "Presupuesto sin factura"
# es, de hecho, el estado NORMAL de cualquier cotización todavía no cerrada —
# sumar eso automáticamente infla la facturación con ventas que nunca pasaron.
#
# Lo que SÍ es automatizable con una señal confiable: un pedido que depósito
# YA despachó de verdad (OT de Picking ejecutada en WMS, mismo criterio que
# deposito.py) pero que no tiene contraparte en Ven_CompCabecera — ahí no hay
# ambigüedad de "se vendió o no", el WMS ya movió la mercadería. Cruza en una
# sola conexión (WMS) usando 3-part naming a EVERWEAR/MAGNUS_SITD, mismo
# patrón ya probado en producción por deposito.py::SQL_WMS_PEDIDOS.
ESTADOS_VALIDOS_PEDIDO = ("CERRADO", "FACTURADO")
COMP_CODIGOS_EXCLUIDOS_PEDIDO = (9, 49, 208, 410)  # mismo blacklist que ventas.py


def _es_valido_pedido(estado_desc) -> bool:
    s = str(estado_desc or "").upper()
    if "CANCEL" in s:
        return False
    return any(p in s for p in ESTADOS_VALIDOS_PEDIDO)


SQL_PEDIDOS_DESPACHADOS = """
SELECT DISTINCT cab.NroMovVenta, cab.CodCliente, cab.CompCodigo,
       e.Ped_EstadoDescripcion AS Estado
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
INNER JOIN EVERWEAR.dbo.VenFer_PedidoCabecera cab ON cab.NroMovVenta = OT.{col_pedido}
LEFT JOIN MAGNUS_SITD.dbo.Pedido_Estados e ON cab.EstadoPedido = e.Ped_Estado
WHERE Codot.CodotProcesoNegocio = 4
  AND OT.OTEstado IN (2, 3, 4)
  AND cab.FechaPedido = ?
"""


def fetch_pedidos_sin_facturar(fecha: str) -> dict:
    """Pedidos de `fecha` con despacho CONFIRMADO en WMS (Picking ejecutado)
    que no aparecen en Ven_CompCabecera (mismo día, tolerancia $1 sobre la
    suma de renglones). No requiere pegar nada a mano — se puede llamar todos
    los días. `fecha`='YYYY-MM-DD'."""
    dia = datetime.strptime(str(fecha)[:10], "%Y-%m-%d").date()
    f_int = (dia - BASE_DATE).days

    conn = get_connection("WMS")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_PEDIDOS_DESPACHADOS.format(col_pedido=OT_COL_PEDIDO), (f_int,))
        cols = [c[0] for c in cur.description]
        pedidos_validos: list[int] = []
        cliente_por_pedido: dict[int, int] = {}
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            comp = d.get("CompCodigo")
            try:
                comp = int(comp) if comp is not None else None
            except (TypeError, ValueError):
                comp = None
            if comp in COMP_CODIGOS_EXCLUIDOS_PEDIDO:
                continue
            if not _es_valido_pedido(d.get("Estado")):
                continue
            nro = int(d["NroMovVenta"])
            pedidos_validos.append(nro)
            cliente_por_pedido[nro] = d.get("CodCliente")

        if not pedidos_validos:
            return {"fecha": dia.isoformat(), "candidatos": [], "total_sin_facturar": 0.0}

        # Total por pedido = suma de renglones (mismo criterio que ventas.py)
        totales: dict[int, float] = {}
        CH = 1000
        for i in range(0, len(pedidos_validos), CH):
            chunk = pedidos_validos[i:i + CH]
            ph = ",".join("?" for _ in chunk)
            cur.execute(
                f"""
                SELECT NroMovVenta, SUM(CantidadPedida * PrecioVenta) AS Total
                FROM EVERWEAR.dbo.VenFer_PedidoReng
                WHERE NroMovVenta IN ({ph})
                GROUP BY NroMovVenta
                """,
                chunk,
            )
            for r in cur.fetchall():
                totales[int(r[0])] = float(_safe(r[1]) or 0)

        # ¿Ya tiene factura real ese mismo día (tolerancia $1)?
        candidatos = []
        total_sin_facturar = 0.0
        for nro in pedidos_validos:
            total = totales.get(nro, 0.0)
            cur.execute(
                f"SELECT COUNT(*) FROM {FACT_DB}.dbo.{FACT_TABLA} "
                f"WHERE {COL_FECHA} = ? AND ABS({COL_IMPORTE} - ?) < 1",
                (f_int, total),
            )
            ya_facturado = cur.fetchone()[0] > 0
            if not ya_facturado:
                candidatos.append({
                    "nroMovVenta": nro,
                    "codCliente": cliente_por_pedido.get(nro),
                    "total": round(total, 2),
                })
                total_sin_facturar += total

        return {
            "fecha": dia.isoformat(),
            "candidatos": candidatos,
            "total_sin_facturar": round(total_sin_facturar, 2),
        }
    finally:
        conn.close()
# (fin finanza.py)

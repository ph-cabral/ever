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

BASE_DATE = date(1800, 12, 28)   # Magnus guarda fechas como días desde esta base

# ── Códigos de comprobante (los pidió contaduría) ────────────────────────────
COD_SUMA  = (11,)                 # lo que ENTRA
COD_RESTA = (22, 23, 24, 25)      # lo que SALE (notas de crédito / devoluciones)
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
COL_IMPORTE      = "Total"               # total CON IVA del comprobante
COL_FECHA        = "FecMovim"            # entero Magnus (días desde 1800-12-28)
FECHA_ES_ENTERO  = True                  # FecMovim es entero
COL_IVA          = "IVA"                 # columna del IVA → neto sin IVA = Total − IVA (EXACTO)
COL_TASA_IVA     = ""                    # TasaIVA vino 0 en toda la tabla; no se usa
COL_NETO         = ""                    # alternativa: neto gravado puro (excluye NoGravado). Para usarla, poné "Neto"
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

    return {
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
    }


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
# (fin finanza.py)

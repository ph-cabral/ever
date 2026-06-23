import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from db import get_connection
from utils import construir_timestamps, calcular_tiempos, COLUMNAS_TIEMPO
from deposito import fetch_wms, fetch_tiempo, fetch_ingresados
from datetime import date, datetime, timedelta

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── Constantes de filtro ──────────────────────────────────────────────────────
ESTADOS_VALIDOS = ['Facturados', 'Cerrados']

BASE_DATE = date(1800, 12, 28)

SQL_QUERY = """
SELECT
    p.NroMovVenta,
    p.FechaPedido,        p.HoraRegistracion,
    p.FechaSuspendido,    p.HoraSuspendido,
    p.FechaConfirmacion,  p.HoraConfirmacion,
    p.FechaArmado,        p.HoraArmado,
    p.FechaCierre,        p.HoraCierre,
    p.EstadoPedido,
    e.Ped_EstadoDescripcion        AS Estado_Desc,
    p.CodCliente,
    c.Cliente_Nombre,
    c.Clasif_EstCliente            AS Categoria,
    p.Zona                         AS CodZona,
    z.ZonaNombre                   AS Zona_Desc,
    p.Vendedor                     AS CodVendedor,
    u.Usu_Arma_Nombre               AS Vendedor_Nombre,
    p.CompCodigo,
    cc.DetalleCorto                AS Comprobante_Desc,
    p.PedOrigenCodigo,
    COALESCE(or1.VtaOrigenDetalle, or2.PedOrigenDetalle) AS Origen_Desc,
    p.Prioridad
FROM EVERWEAR.dbo.VenFer_PedidoCabecera p
LEFT JOIN MAGNUS_SITD.dbo.Pedido_Estados         e   ON p.EstadoPedido    = e.Ped_Estado
LEFT JOIN MAGNUS_SITD.dbo.Clientes               c   ON p.CodCliente      = c.CodCliente
LEFT JOIN MAGNUS_SITD.dbo.Zonas                  z   ON p.Zona            = z.ZonaCodigo
LEFT JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma           u   ON p.Vendedor        = u.Usu_Arma_Codigo
LEFT JOIN MAGNUS_SITD.dbo.Ven_CodComprobante     cc  ON p.CompCodigo      = cc.CompCodigo
LEFT JOIN MAGNUS_SITD.dbo.Vta_OrigenRegistracion or1 ON p.PedOrigenCodigo = or1.VtaOrigenCodigo
LEFT JOIN MAGNUS_SITD.dbo.Ped_OrigenRegistracion or2 ON p.PedOrigenCodigo = or2.PedOrigenCodigo
WHERE p.CompCodigo NOT IN (9, 49, 208, 410)
  AND p.FechaPedido >= {corte_dias}
ORDER BY p.NroMovVenta DESC
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def cargar_df(meses: int = 7) -> pd.DataFrame:
    corte_fecha = pd.Timestamp.now() - pd.DateOffset(months=meses)
    corte_dias  = (corte_fecha.date() - BASE_DATE).days

    conn   = get_connection()
    df_raw = pd.read_sql(SQL_QUERY.format(corte_dias=corte_dias), conn)
    conn.close()

    df = construir_timestamps(df_raw)
    df = calcular_tiempos(df)

    for col in ['Estado_Desc', 'Comprobante_Desc', 'Zona_Desc', 'Vendedor_Nombre']:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    df['fecha'] = df['ts_Registro'].dt.normalize()
    df['mes']   = df['ts_Registro'].dt.to_period('M').astype(str)
    df['año']   = df['ts_Registro'].dt.year

    return df

def filtrar(df: pd.DataFrame, meses: int = 7) -> pd.DataFrame:
    """Filtra por estados válidos. La ventana de fechas ya viene aplicada desde SQL."""
    df = df[df['Estado_Desc'].isin(ESTADOS_VALIDOS)].copy()
    return df

def promedio_seguro(serie: pd.Series) -> float:
    validos = serie.dropna()
    return round(float(validos.mean()), 2) if len(validos) > 0 else 0.0

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}

# ── Depósito (reemplazo de los Excel de /deposito) ────────────────────────────

def _parse_rango(desde: str | None, hasta: str | None):
    """desde/hasta = 'YYYY-MM-DD'. Default: últimos 6 meses hasta hoy."""
    hoy = date.today()
    h = datetime.strptime(hasta, "%Y-%m-%d") if hasta else datetime(hoy.year, hoy.month, hoy.day)
    d = datetime.strptime(desde, "%Y-%m-%d") if desde else (h - timedelta(days=180))
    d = d.replace(hour=0, minute=0, second=0, microsecond=0)
    h = h.replace(hour=23, minute=59, second=59, microsecond=0)
    return d, h

@app.get("/deposito/wms")
def deposito_wms(
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
):
    """Productividad de Operarios (WMS) por rango de OTFechaHoraEjecucion."""
    try:
        d, h = _parse_rango(desde, hasta)
        rows = fetch_wms(d, h)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
    return {
        "desde": d.date().isoformat(),
        "hasta": h.date().isoformat(),
        "total": len(rows),
        "rows": rows,
    }

@app.get("/deposito/tiempo")
def deposito_tiempo():
    """Tiempo de Pedidos = EVERWEAR.dbo.TMP_TiempoDePedidos (snapshot ~90 días)."""
    try:
        rows = fetch_tiempo()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
    return {"total": len(rows), "rows": rows}

@app.get("/deposito/ingresados")
def deposito_ingresados(
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
):
    """Pedidos registrados por día (lo que ingresó) en el rango."""
    try:
        d, h = _parse_rango(desde, hasta)
        rows = fetch_ingresados(d, h)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
    return {
        "desde": d.date().isoformat(),
        "hasta": h.date().isoformat(),
        "total": sum(r["pedidos"] for r in rows),
        "rows": rows,
    }

@app.get("/indicadores/tiempos")
def get_tiempos(meses: int = Query(default=7, ge=1, le=12)):
    try:
        df_full = cargar_df(meses)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

    df = filtrar(df_full, meses)

    if df.empty:
        return {
            "total": 0, "meses": meses,
            "metricas_mensuales": [], "por_zona": [],
            "por_vendedor": [], "por_prioridad": []
        }

    # ── Métricas mensuales ────────────────────────────────────────────────────
    metricas_mensuales = (
        df.groupby('mes')
          .agg(
              cantidad           = ('NroMovVenta',                  'count'),
              t_reg_susp         = ('Tiempo_Reg_Suspension_min',    promedio_seguro),
              t_susp_confirm     = ('Tiempo_Susp_Confirmacion_min', promedio_seguro),
              t_reg_confirm      = ('Tiempo_Reg_Confirmacion_min',  promedio_seguro),
              t_confirm_armado   = ('Tiempo_Confirm_Armado_min',    promedio_seguro),
              t_armado_cierre    = ('Tiempo_Armado_Cierre_min',     promedio_seguro),
              t_confirm_cierre   = ('Tiempo_Confirm_Cierre_min',    promedio_seguro),
          )
          .reset_index()
          .sort_values('mes')
          .to_dict(orient='records')
    )

    # ── Por zona ──────────────────────────────────────────────────────────────
    por_zona = (
        df.groupby('Zona_Desc')
          .agg(
              cantidad         = ('NroMovVenta',               'count'),
              t_confirm_cierre = ('Tiempo_Confirm_Cierre_min', promedio_seguro),
          )
          .reset_index()
          .sort_values('cantidad', ascending=False)
          .to_dict(orient='records')
    )

    # ── Por vendedor ──────────────────────────────────────────────────────────
    por_vendedor = (
        df.groupby('Vendedor_Nombre')
          .agg(
              cantidad         = ('NroMovVenta',               'count'),
              t_confirm_cierre = ('Tiempo_Confirm_Cierre_min', promedio_seguro),
          )
          .reset_index()
          .sort_values('cantidad', ascending=False)
          .head(15)
          .to_dict(orient='records')
    )

    # ── Por prioridad ─────────────────────────────────────────────────────────
    por_prioridad = (
        df.groupby('Prioridad')
          .agg(
              cantidad         = ('NroMovVenta',               'count'),
              t_confirm_cierre = ('Tiempo_Confirm_Cierre_min', promedio_seguro),
          )
          .reset_index()
          .sort_values('Prioridad')
          .to_dict(orient='records')
    )

    return {
        "total":              len(df),
        "meses":              meses,
        "mes_reciente":       df['mes'].max(),
        "metricas_mensuales": metricas_mensuales,
        "por_zona":           por_zona,
        "por_vendedor":       por_vendedor,
        "por_prioridad":      por_prioridad,
    }

@app.get("/debug/timestamps")
def debug_timestamps():
    """Verificar que la conversión de fechas/horas es correcta."""
    try:
        conn = get_connection()
        df_raw = pd.read_sql(
            "SELECT TOP 10 NroMovVenta, FechaPedido, HoraRegistracion, "
            "FechaSuspendido, HoraSuspendido, FechaConfirmacion, HoraConfirmacion, "
            "FechaArmado, HoraArmado, FechaCierre, HoraCierre "
            "FROM EVERWEAR.dbo.VenFer_PedidoCabecera "
            "WHERE CompCodigo NOT IN (9,49,208,410) "
            "ORDER BY NroMovVenta DESC",
            conn
        )
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    if df_raw.empty:
        return {"error": "query vacio", "filas": 0}

    df = construir_timestamps(df_raw)
    df = calcular_tiempos(df)

    result = []
    for _, row in df.iterrows():
        result.append({
            "NroMovVenta":               int(row['NroMovVenta']),
            "FechaPedido_raw":           int(row['FechaPedido']),
            "HoraRegistracion_raw":      int(row['HoraRegistracion']),
            "ts_Registro":               str(row['ts_Registro']),
            "ts_Suspendido":             str(row['ts_Suspendido']),
            "ts_Confirmacion":           str(row['ts_Confirmacion']),
            "ts_Armado":                 str(row['ts_Armado']),
            "ts_Cierre":                 str(row['ts_Cierre']),
            "Tiempo_Reg_Suspension_min": row['Tiempo_Reg_Suspension_min'],
            "Tiempo_Susp_Confirm_min":   row['Tiempo_Susp_Confirmacion_min'],
            "Tiempo_Confirm_Armado_min": row['Tiempo_Confirm_Armado_min'],
            "Tiempo_Armado_Cierre_min":  row['Tiempo_Armado_Cierre_min'],
            "Tiempo_Confirm_Cierre_min": row['Tiempo_Confirm_Cierre_min'],
        })

    return {"filas": len(result), "datos": result}

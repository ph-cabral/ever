import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from db import get_connection
from utils import construir_timestamps, calcular_tiempos, COLUMNAS_TIEMPO
from deposito import (
    fetch_wms, fetch_tiempo, fetch_ingresados, fetch_faltantes,
    fetch_faltantes_fechas, fetch_vivo, fetch_faltantes_ot, fetch_faltantes_ot_diag,
    fetch_ot_diferencias,
    fetch_wms_estados, fetch_wms_estados_diag,
    fetch_articulo_ubicaciones, fetch_articulos_multi_ubicacion,
    fetch_stock_deposito1, fetch_stock_por_articulos, fetch_stock_export,
    fetch_contenedor,
)
from compras import fetch_ordenes_pendientes
from ingresos import fetch_remitos_ingreso
from finanza import fetch_facturacion_dia, fetch_descubrir
from clientes import fetch_cliente
from mesa_control import (
    fetch_mesa_control, fetch_mesa_control_diag,
    fetch_mesa_control_sp_definicion, fetch_mesa_control_tablas_diag,
    fetch_mesa_control_recontroles_diag,
)
from errores_mesa import (
    fetch_pedido_lookup, insert_error_mesa, opciones as errores_mesa_opciones,
    fetch_ubicacion_diag, fetch_errores_mesa_list, fetch_operario_nombre,
    insert_error_calidad,
)
from datetime import date, datetime, timedelta

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Constantes de filtro ──────────────────────────────────────────────────────
ESTADOS_VALIDOS = ['Facturados', 'Cerrados']
# ESTADOS_VALIDOS  = ['Abiertos', 'Facturados', 'Cerrados']
COMP_VALIDOS     = [10, 70, 100, 210, 310]
COMPROBANTE_DESC = 'PED.MAYOR'

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
    return df[
        df['CompCodigo'].isin(COMP_VALIDOS)
        & df['Estado_Desc'].isin(ESTADOS_VALIDOS)
        & (df['Comprobante_Desc'] == COMPROBANTE_DESC)
    ].copy()

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
    todos: bool = Query(default=False),
):
    """Productividad de Operarios (WMS) por rango de OTFechaHoraEjecucion."""
    try:
        d, h = _parse_rango(desde, hasta)
        rows = fetch_wms(d, h, todos=todos)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
    return {
        "desde": d.date().isoformat(),
        "hasta": h.date().isoformat(),
        "total": len(rows),
        "rows": rows,
    }

@app.get("/deposito/wms-estados")
def deposito_wms_estados(
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
):
    """Tablero por rango: OT (Picking) por estado + carga por preparador
    desglosada por estado. Sin params → último día con OT ejecutada."""
    try:
        return fetch_wms_estados(desde, hasta)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/wms-estados/diag")
def deposito_wms_estados_diag():
    """Diagnóstico: OTEstado reales (Picking) + tablas de descripción de estado +
    columnas de fecha de OT. Para confirmar el mapeo de /deposito/wms."""
    try:
        return fetch_wms_estados_diag()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

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

@app.get("/deposito/vivo")
def deposito_vivo():
    """Tablero EN VIVO: pedidos (OT) en espera / en proceso y carga por operario AHORA."""
    try:
        return fetch_vivo()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/faltantes")
def deposito_faltantes(
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    historico: bool = Query(default=False),
):
    """Faltantes (renglones pendientes 'sin existencia' por controlar).
    · Sin params  → último snapshot con registro < hoy (comportamiento original).
    · desde/hasta → todos los snapshots del rango, deduplicados por renglón, con
      'PrimerDia' (primera aparición) para poder restar la OC por día.
    · historico=true (con rango) → incluye además los faltantes ya entregados/
      cubiertos a mitad del rango; cada fila trae 'Vivo' (1 vivo / 0 histórico)."""
    try:
        return fetch_faltantes(desde, hasta, historico)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/faltantes/fechas")
def deposito_faltantes_fechas():
    """Snapshots disponibles (fechas con registro < hoy) para el selector de la vista."""
    try:
        return fetch_faltantes_fechas()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/articulo/ubicaciones")
def deposito_articulo_ubicaciones(articulo: str = Query(...)):
    """Ubicaciones (sin filtrar) de un artículo con >1 unidad: ubicacion + cantidad."""
    try:
        return fetch_articulo_ubicaciones(articulo)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/articulos/multi-ubicacion")
def deposito_articulos_multi_ubicacion():
    """Artículos con más de una ubicación asignada (rack), para depurar el maestro."""
    try:
        return fetch_articulos_multi_ubicacion()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/contenedor")
def deposito_contenedor(tag: str = Query(...)):
    """Contenedor por TAG (WMS): info general (maestro Contenedor), contenido
    actual (ContenedorItem) e historial de movimientos (KmovContenedor), con
    el usuario REAL (Personal) además del usuario de "Registro", que muchas
    veces es la cuenta genérica del sistema ("User Anonymous")."""
    try:
        return fetch_contenedor(tag)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/stock")
def deposito_stock(
    page: int = Query(default=1),
    page_size: int = Query(default=50),
    q: str | None = Query(default=None),
):
    """Stock paginado por depósito (1/2/3) + total: código, nombre, stock por
    depósito, proveedor."""
    try:
        return fetch_stock_deposito1(page, page_size, q)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/stock/export")
def deposito_stock_export():
    """Stock COMPLETO (sin paginar, todos los artículos) por depósito 1/2/3 +
    total. Para el botón 'Exportar Excel' de /deposito/stock."""
    try:
        return fetch_stock_export()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/stock-por-articulos")
def deposito_stock_por_articulos(codigos: str = Query(...)):
    """Stock del depósito 1 (central) para una lista puntual de códigos
    (separados por coma), sin paginar. Usado por /compras/faltantes para
    mostrar la existencia real al lado de lo marcado 'sin existencia'."""
    try:
        lista = [c for c in codigos.split(",") if c.strip()]
        return fetch_stock_por_articulos(lista)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/faltantes-ot")
def deposito_faltantes_ot(
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
):
    """Faltantes agrupados por OT (NUEVA fuente de /deposito/faltantes): por cada
    OT de Picking, renglones cumplidos (recolectados) vs faltantes (sin recolectar).
    Excluye pedidos descartados/anulados por estado de Magnus.
    · Sin params  → último día con armado.
    · desde/hasta → ese rango por OTFechaHoraEjecucion."""
    try:
        return fetch_faltantes_ot(desde, hasta)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/faltantes-ot/diag")
def deposito_faltantes_ot_diag():
    """Diagnóstico: columnas reales de OT/OTItem (WMS) para confirmar OT_COL_PEDIDO
    y los estados de pedido presentes (para ajustar ESTADOS_VALIDOS)."""
    try:
        return fetch_faltantes_ot_diag()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/ot-diferencias")
def deposito_ot_diferencias(
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
):
    """Renglones de OT Picking Cumplidas (WMS) con cantidad pedida != cumplida.
    Fuente NUEVA de /deposito/faltantes (reemplaza Ven_PedRenPendientes de Magnus).
    Sin params → último día Cumplido antes de hoy."""
    try:
        return fetch_ot_diferencias(desde, hasta)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

# ── Compras: OC pendientes de recibir por artículo (lo que "va a llegar") ─────
@app.get("/compras/ordenes-pendientes")
def compras_ordenes_pendientes(desde: str | None = Query(default=None)):
    """OC abiertas, pendiente de recibir (Pedida - Recibida) agregado por artículo.
    Solo lectura sobre Magnus; se cruza con faltantes en /compras/faltantes.
    `desde`='YYYY-MM-DD' (default OC_DESDE_DEFAULT): solo OC con FecMovim >= desde,
    para que las OC viejas no cubran faltantes actuales."""
    try:
        return fetch_ordenes_pendientes(desde)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

# ── Compras: remitos de ingreso x OC ya concretados (lo que "ya llegó") ───────
@app.get("/compras/ingresos")
def compras_ingresos(desde: str | None = Query(default=None)):
    """Remitos de ingreso x OC ya concretados (Com_RemitoCabecera/Renglones),
    agregado por artículo. Fuente verificada: ingresos_extraccion.py.
    Para /ventas/faltantes ("Tabla 2"): confirma que un renglón con fecha de
    arribo YA llegó físicamente. `desde`='YYYY-MM-DD' (default: hoy-60)."""
    try:
        return fetch_remitos_ingreso(desde)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

# ── Finanza: facturación del día (calculadora) ───────────────────────────────
@app.get("/finanza/facturacion-dia")
def finanza_facturacion_dia(fecha: str | None = Query(default=None)):
    """Facturación del día: ENTRA (cód 11) − SALE (cód 22/23/24/25).
    Devuelve neto con y sin IVA (21%). `fecha`='YYYY-MM-DD' (default: hoy).
    Solo lectura sobre Magnus."""
    try:
        return fetch_facturacion_dia(fecha)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/finanza/descubrir")
def finanza_descubrir():
    """Introspección de Magnus para ubicar la tabla de facturación (códigos,
    tablas candidatas y tablas con código+importe+fecha). Apoyo para configurar
    finanza.py. Ver también descubrir_facturacion.sql."""
    try:
        return fetch_descubrir()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

# ── Clientes: lookup por número desde Magnus (para /manguera/corte) ───────────
@app.get("/clientes/{numero}")
def clientes_get(numero: int):
    """Cliente por número desde Magnus (CodCliente, Cliente_Nombre).
    Solo lectura. 404 si no existe."""
    try:
        cli = fetch_cliente(numero)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
    if not cli:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cli

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


@app.get("/deposito/resumen-ot")
def deposito_resumen_ot(desde: str | None = None, hasta: str | None = None):
    try:
        return deposito.fetch_resumen_ot(desde, hasta)
    except Exception as e:
        raise HTTPException(503, f"SQL Error: {str(e)}")
    
    
@app.get("/deposito/mesa-control")
def deposito_mesa_control(meses: str = Query(..., description="Meses 'YYYY-MM' separados por coma")):
    """Productividad por Controlador (SP RPT_V325_ProductividadPorControlador),
    uno o más meses para comparar. `meses`='2026-05,2026-06,2026-07'.
    Solo lectura sobre EVERWEAR. Ver mesa_control.py."""
    lista = [m.strip() for m in meses.split(",") if m.strip()]
    if not lista:
        raise HTTPException(status_code=400, detail="Falta el parámetro 'meses'")
    try:
        return fetch_mesa_control(lista)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/mesa-control/diag")
def deposito_mesa_control_diag(mes: str | None = Query(default=None)):
    """Diagnóstico: columnas reales devueltas por el SP de productividad por
    controlador, para confirmar el mapeo de mesa_control.py."""
    try:
        return fetch_mesa_control_diag(mes)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/mesa-control/sp-definicion")
def deposito_mesa_control_sp_definicion():
    """Texto T-SQL real del SP RPT_V325_ProductividadPorControlador (sólo
    lectura de metadata). Sirve para ubicar la tabla fuente de control
    (columnas de factura/pedido/renglón) y así poder armar un conteo EXACTO
    de items controlados (sin duplicar por doble controlador) — ver pedido
    de contaduría sobre la pestaña Mesas de Control."""
    try:
        return fetch_mesa_control_sp_definicion()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/mesa-control/tablas-diag")
def deposito_mesa_control_tablas_diag():
    """Columnas reales de Ven_PedImpresoCP y venfer_pedidoReng (tablas fuente
    del SP de mesa de control), para armar el conteo EXACTO (sin duplicar)."""
    try:
        return fetch_mesa_control_tablas_diag()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/mesa-control/recontroles-diag")
def deposito_mesa_control_recontroles_diag(mes: str | None = Query(default=None)):
    """Cuántos pedidos tienen más de 1 fila en Ven_PedImpresoCP para el mismo
    (NroMovVenta, CodCentroPrep) en el mes — confirma el recontrol/reimpresión
    que explica la diferencia contra la planilla de contaduría."""
    try:
        return fetch_mesa_control_recontroles_diag(mes)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")

@app.get("/deposito/ubicacion-columnas/diag")
def diag_ubicacion_cols():
    conn = get_connection("WMS")
    cur = conn.cursor()
    cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='UbicacionDetalle'")
    return {"columnas": [r[0] for r in cur.fetchall()]}


# ── Errores de Mesa de Control (widget de escritorio) ─────────────────────────
class ErrorMesaIn(BaseModel):
    nroPedido: int
    nroOperario: int
    detalleError: str

class ErrorCalidadIn(BaseModel):
    nroPedido: int
    detalleError: str

@app.get("/deposito/pedido/{nro}")
def deposito_pedido(nro: int):
    """Lookup por Nro Pedido (NroMovVenta): Fecha + Tipo Pedido (Magnus) + OT +
    N° Armador/Nombre (WMS). Solo lectura. 404 si no existe en Magnus."""
    try:
        info = fetch_pedido_lookup(nro)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
    if info is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return info

@app.get("/deposito/errores-mesa")
def deposito_errores_mesa_listar(
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    limit: int = Query(default=1000, le=5000),
):
    """Lista de registros de deposito.errores_mesa (alta desde el widget de
    escritorio), para la vista de depósito. Filtro opcional por rango de
    fecha; Controlador/Preparador se filtran en el cliente."""
    try:
        return fetch_errores_mesa_list(desde, hasta, limit)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {str(e)}")

@app.get("/deposito/errores-mesa/opciones")
def deposito_errores_mesa_opciones():
    """Opciones fijas del select de Detalle Error. Ver errores_mesa.py —
    DETALLE_ERROR_OPCIONES."""
    return errores_mesa_opciones()

@app.get("/deposito/errores-mesa/operario")
def deposito_errores_mesa_operario(nro: int = Query(...)):
    """Nombre del operario/controlador por N° de Personal (WMS), para la
    pantalla inicial del widget (se pide 1 vez al abrir, no por pedido)."""
    try:
        nombre = fetch_operario_nombre(nro)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
    if not nombre:
        raise HTTPException(status_code=404, detail="Operario no encontrado")
    return {"nroOperario": nro, "nombre": nombre}

@app.post("/deposito/errores-mesa")
def deposito_errores_mesa_crear(body: ErrorMesaIn):
    """Alta de un registro de error (Postgres deposito.errores_mesa). Re-resuelve
    fecha/tipo/OT/armador del pedido + nombre del controlador (nroOperario,
    WMS.Personal) del lado del server (no confía en el cliente)."""
    try:
        return insert_error_mesa(body.nroPedido, body.nroOperario, body.detalleError)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {str(e)}")

@app.post("/deposito/errores-mesa/calidad")
def deposito_errores_mesa_calidad_crear(body: ErrorCalidadIn):
    """Alta desde el widget de Calidad: controlador se resuelve solo (Magnus,
    Ven_PedImpresoCP), no lo pide el widget. NO guarda preparador. Ver
    insert_error_calidad."""
    try:
        return insert_error_calidad(body.nroPedido, body.detalleError)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {str(e)}")

@app.get("/deposito/errores-mesa/ubicacion-diag")
def deposito_errores_mesa_ubicacion_diag(nro: int | None = Query(default=None)):
    """Diagnóstico: columna de OT detectada para 'Observaciones'/ubicación
    (LIKE '%OBSERV%') y, con `nro`, el lookup completo de ese pedido."""
    try:
        return fetch_ubicacion_diag(nro)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SQL Error: {str(e)}")
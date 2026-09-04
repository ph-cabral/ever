"""Bonificaciones y ajustes de venta (Magnus, SOLO LECTURA).

Qué resuelve
------------
Las vistas de ventas (`ventas.py`, `bulones.py`) leen `Ven_CompRenglon`: un
renglón por artículo. Los descuentos comerciales de Ever Wear NO se
instrumentan ahí — se emiten como notas de crédito por CONCEPTO, que viven en
`Ven_RenDebCre` y no tienen artículo. Por eso nunca restaron en las vistas y
los totales quedaban por encima del BI. Ene-ago 2026 son -894M, un 7% de la
venta con artículo.

Es la misma fuente que el BI: `_VEN_05_REAL_Debitos_y_Creditos` arma con esto
las filas `Concept(N)` de la tabla de hechos `MAGNUS_SITD.dbo.Ventas_Hechos`
(las que en el pivot caen bajo "Artículos Sin Patrón"). El recorte de acá es
el del SP, salvo el filtro de conceptos.

Criterio
--------
· Sólo los conceptos COMERCIALES (CONCEPTOS_COMERCIALES). Los financieros
  —cheque rechazado, intereses, gastos bancarios, percepciones— quedan afuera:
  son débitos que SUMAN (+151M en ene-ago 2026) y no son venta.
· Sólo la sub-empresa REAL, igual que el resto de la app. El par PRUEBA
  (`PRU_Ven_RenDebCre`, vía `_VEN_06`) pesa 7-8% de la bonificación y hoy no
  entra en ninguna vista; mezclarlo sobredimensionaría el descuento contra una
  venta que sí es sólo REAL. Ver la nota de sub-empresas del proyecto.
· El signo sale de `Ven_CodCom.DebitoCredito` igual que la venta: 1 = débito
  suma, 2 = crédito resta. Una NC de bonificación da negativo.
· NO hay unidades que restar: el concepto no tiene cantidad (el SP del BI
  emite `0 AS Cantidad`). Estas funciones devuelven sólo $.

Gotchas heredados (ver el docstring de ventas.py antes de tocar nada)
· Las fechas van SIEMPRE como enteros Magnus (días desde 1800-12-28)
  comparados contra la columna cruda. Nunca `dbo.fecha_cla2sql(...)` contra un
  parámetro ni DATEADD en el SELECT.
· El año/mes sale del CASE de rangos enteros de `ventas._case_anio_mes`.
"""
import os
import time

from db import get_connection
from ventas import BASE_DATE, _case_anio_mes, _resolver_rango, _safe

# Conceptos que ajustan la VENTA. Salen del maestro `Ven_ConcDebCre`:
#   3  FLETE                    4  BONIFICACION
#   12 BONIFICACION EXTRA      24  AJUSTES VENTAS
#   28 MERCADERIA VENTAS       29  MERCADERIA VENTAS 10.50%
# Quedan afuera a propósito los financieros (1 cheque rechazado, 2/11
# intereses, 5/16 comisiones bancarias, 14 gastos de cobranza, 18 deudores,
# 32 gastos por cheque rechazado, 33/35/36 percepciones IIBB…).
#
# El maestro tiene además variantes emparentadas que HOY no tienen movimiento
# en ningún período mirado (6 DEVOLUCION MERCADERIA, 7 PROMOCION Y PUBLICIDAD
# VENTAS, 9 FLETE, 21 BONIFICACION - EXENTO, 31 AJUSTE VENTAS EXENTO): si
# alguna vez se empiezan a usar, van agregadas acá — no hay ninguna marca en
# la base que separe comercial de financiero, la lista es el criterio.
CONCEPTOS_COMERCIALES = tuple(
    int(x) for x in os.getenv("BONIF_CONCEPTOS", "3,4,12,24,28,29").split(",") if x.strip()
)
_IN_CONCEPTOS = ",".join(str(c) for c in CONCEPTOS_COMERCIALES)

# Recorte del SP del BI. `SubSistemaVentas = 2` es la clase "Débitos y
# Créditos" y es lo que hace selectiva la consulta junto con el IN de
# conceptos; el join a Ven_Clientes está porque lo tiene el SP (es un lookup
# por PK y no descarta ninguna fila del período, verificado 2026-09-04).
_FROM = """
FROM Ven_RenDebCre    rd
JOIN Ven_CompCabecera c   ON c.NroMovVenta = rd.NroMovVenta
JOIN Ven_CodCom       cc  ON cc.CompCodigo = c.CompCodigo
JOIN Ven_Clientes     cli ON cli.CodCliente = c.CodCliente
LEFT JOIN Ven_ConcDebCre cn ON cn.CodConcepto = rd.CodConcepto
WHERE cc.SubSistemaVentas = 2
  AND cc.EvitaInformesYListados <> 1
  AND rd.CodConcepto IN (%s)
  AND c.FecMovim BETWEEN ? AND ?
""" % _IN_CONCEPTOS

_IMPORTE = "SUM(CASE cc.DebitoCredito WHEN 1 THEN rd.Importe ELSE rd.Importe * -1 END)"

_TTL_SEG = 15 * 60
_CACHE: dict[tuple, tuple[float, dict]] = {}


def _conn():
    conn = get_connection("EVERWEAR")
    cur = conn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
    return conn, cur


def _cacheado(key: tuple, forzar: bool):
    if forzar:
        return None
    hit = _CACHE.get(key)
    if hit is not None and (time.monotonic() - hit[0]) < _TTL_SEG:
        return hit[1]
    return None


def _guardar(key: tuple, valor: dict) -> dict:
    _CACHE[key] = (time.monotonic(), valor)
    return valor


def _ym(t: tuple[int, int]) -> str:
    return "%04d-%02d" % t


def fetch_bonificaciones(desde: str | None = None, hasta: str | None = None,
                         vendedor: int | None = None,
                         forzar: bool = False) -> dict:
    """Bonificaciones y ajustes de venta de un rango de meses.

    `vendedor`: acota al vendedor grabado en el comprobante de la ND/NC
    (`Ven_CompCabecera.Vendedor`), que es el mismo criterio que el ranking de
    vendedores de bulones.py — no la cartera del cliente.

    `desde`/`hasta` ('YYYY-MM'), ambos meses completos; default, la ventana
    fija de _resolver_rango. Devuelve el total y tres aperturas: por concepto,
    por mes y por vendedor. Todo en $ — no hay unidades.

    Ojo con el alcance: el importe es de TODA la empresa, no de una línea de
    artículo. Restarlo dentro de una vista acotada a una línea (bulonería)
    sobredimensiona el descuento; ahí hay que prorratear o mostrarlo aparte.
    """
    desde_ym, hasta_ym, d1, d2 = _resolver_rango(desde, hasta)
    key = ("bonif", desde_ym, hasta_ym, vendedor)
    hit = _cacheado(key, forzar)
    if hit is not None:
        return hit

    where = _FROM
    params: tuple = (d1, d2)
    if vendedor is not None:
        where = _FROM + "  AND c.Vendedor = ?\n"
        params = (d1, d2, int(vendedor))

    anios = tuple(range(desde_ym[0], hasta_ym[0] + 1))
    case_mes = _case_anio_mes(anios, "c.FecMovim")

    conn, cur = _conn()
    try:
        cur.execute(f"SELECT {_IMPORTE} AS Importe, COUNT(*) AS Renglones {where}", params)
        fila = cur.fetchone()
        total = round(float(_safe(fila[0]) or 0), 2)
        renglones = int(fila[1] or 0)

        cur.execute(
            f"SELECT rd.CodConcepto, MAX(LTRIM(RTRIM(cn.Detalle))) AS Detalle, "
            f"{_IMPORTE} AS Importe {where} GROUP BY rd.CodConcepto ORDER BY 3",
            params)
        por_concepto = [
            {"concepto": int(c), "detalle": (d or "").strip() or str(c),
             "monto": round(float(_safe(m) or 0), 2)}
            for c, d, m in cur.fetchall()
        ]

        cur.execute(f"SELECT {case_mes} AS AnioMes, {_IMPORTE} AS Importe "
                    f"{where} GROUP BY {case_mes} ORDER BY 1", params)
        por_mes = [
            {"mes": "%04d-%02d" % (int(am) // 100, int(am) % 100),
             "monto": round(float(_safe(m) or 0), 2)}
            for am, m in cur.fetchall() if am is not None
        ]

        cur.execute(f"SELECT c.Vendedor, {_IMPORTE} AS Importe "
                    f"{where} GROUP BY c.Vendedor ORDER BY 2", params)
        por_vendedor = [
            {"codigo": int(v), "monto": round(float(_safe(m) or 0), 2)}
            for v, m in cur.fetchall() if v is not None
        ]
    finally:
        cur.close()
        conn.close()

    return _guardar(key, {
        "desde": _ym(desde_ym),
        "hasta": _ym(hasta_ym),
        "conceptos": list(CONCEPTOS_COMERCIALES),
        "total": total,
        "renglones": renglones,
        "porConcepto": por_concepto,
        "porMes": por_mes,
        "porVendedor": por_vendedor,
    })


def bonificacion_por_vendedor(desde: str | None = None, hasta: str | None = None,
                              forzar: bool = False) -> dict[int, float]:
    """{codigo_vendedor: monto} para restar de un ranking ya armado, sin pedir
    la apertura completa. Sale del mismo cache que fetch_bonificaciones."""
    data = fetch_bonificaciones(desde=desde, hasta=hasta, forzar=forzar)
    return {v["codigo"]: v["monto"] for v in data["porVendedor"]}

"""
Presupuestos de BULONERÍA (CodComp 45) — para /ventas/presupuestos.

 2026-08-31: una vista donde se vean los presupuestos SEPARADOS
POR ESTADO, y abajo el ranking de VENTAS (no de presupuestos) por unidades o
por $. El ranking de abajo NO se implementa acá: el front reusa tal cual los
endpoints que ya existen (/ventas/bulones/top-vendedores | top-patrones |
top-clientes, ver bulones.py). Este módulo aporta sólo los presupuestos.

Origen de los datos (descubierto y verificado contra el ERP el 2026-08-31,
ver la memoria del proyecto `presupuestos_bulones`):

  · EVERWEAR.dbo.Pre_PresupCab / Pre_PresupReng — el nombre está ABREVIADO
    (`Pre_`), por eso no aparece buscando "Presupuesto" en INFORMATION_SCHEMA.
  · Tipo de comprobante: Ven_CodCom.CompCodigo. 32=PRESUPUESTO,
    34=MOSTRADOR, 44=MÓVIL y **45=PRESUPUESTO BULONES**, que es el único que
    entra acá (esta vista es la gemela de /ventas/bulones).
  · `NroPresupuesto` es el "Nº Interno" de la pantalla y la PK del join con
    los renglones; el "Número" impreso (0001-00023681) es
    CompCentro + CompNumero.
  · Estado: 0=Sin confirmar, 1=Autorizado, 2=Cancelado, 3=Aprobado.
  · Renglón: `Cantidad`=C.Presupuestada, `CantidadPedida`=C.Entregada (ya
    convertida en pedido/factura), `Cantidad_a_Pedir`=C.Pendiente.
    **Importe = Cantidad × PrecioVtaUniSinImp** (el precio ya viene
    bonificado). Verificado: la suma de importes da igual al `Neto` de
    cabecera en los 6 presupuestos existentes, con dif ≤ 0,01 por redondeo.

Maestros de descripciones (los tres primeros costaron dos vueltas de prueba
y error, no cambiarlos sin releer esa memoria):
  · cliente     → Ven_Clientes.CodCliente / RazonSocial
  · vendedor    → MAGNUS_SITD.dbo.Vendedores.VendedorCodigo / VendedorNombre
    ⚠ está en OTRA BASE, no en EVERWEAR. Es el mismo maestro que usa
    bulones.py para el ranking de vendedores.
  · transporte  → Ven_CliTrasnsporte.CodTransporte / Nombre  (sic: el nombre
    de la tabla tiene un typo en la base, no es error de tipeo acá)
  · cond. venta → Ven_CondicionVenta.CondicionVenta / Nombre (el código 0 no
    existe en el maestro: son presupuestos cargados sin condición)
  · forma pago  → Ven_TipoFormaPago.CodForPago / Detalle

Gotcha de fechas (el mismo de ventas.py/bulones.py): `FechaPres` es un ENTERO
Magnus (días desde 1800-12-28). Se compara la COLUMNA CRUDA contra enteros
parametrizados. Nunca envolverla en dbo.fecha_cla2sql(...) ni en DATEADD para
filtrar: con el driver viejo eso no filtra bien y se pierden/cuelan filas sin
tirar error.

Acceso por vendedor: un no-admin ve SÓLO los presupuestos que él hizo
(`p.Vendedor`), no la cartera del cliente. Es a propósito y distinto del
criterio de bulones.py: un presupuesto es un acto del vendedor que lo cargó,
así que el dueño natural es ese, no quien tenga la zona del cliente.
"""
import calendar
import time
from datetime import date, timedelta

from db import get_connection
from ventas import BASE_DATE, _parse_ym, _safe

COD_COMP = 45  # PRESUPUESTO BULONES (Ven_CodCom)

ESTADOS = {
    0: "Sin confirmar",
    1: "Autorizado",
    2: "Cancelado",
    3: "Aprobado",
}

# Tope de renglones por consulta. Con CodComp 45 hoy sobra muchísimo (75
# renglones en el mes), pero evita que un rango largo devuelva algo
# impagable si el tipo de comprobante crece.
MAX_RENGLONES = 20_000

_TTL_SEG = 5 * 60
_CACHE: dict[tuple, tuple[float, dict]] = {}


def _rango(desde: str | None, hasta: str | None):
    """('YYYY-MM'|None, 'YYYY-MM'|None) -> (desde_ym, hasta_ym, int1, int2).

    Default DISTINTO al de los rankings de ventas: acá es el MES EN CURSO
    ("mes en curso + selector"). En ventas el default es la
    ventana fija de 12 meses terminando el mes anterior porque el mes en
    curso está incompleto; un presupuesto, en cambio, se mira mientras está
    vivo — el mes incompleto es justamente el que interesa.
    """
    hoy = date.today()
    d_ym = _parse_ym(desde) if desde else (hoy.year, hoy.month)
    h_ym = _parse_ym(hasta) if hasta else d_ym
    if d_ym > h_ym:
        d_ym, h_ym = h_ym, d_ym
    primero = date(d_ym[0], d_ym[1], 1)
    ultimo = date(h_ym[0], h_ym[1], calendar.monthrange(h_ym[0], h_ym[1])[1])
    return d_ym, h_ym, (primero - BASE_DATE).days, (ultimo - BASE_DATE).days


def _fecha(n) -> str | None:
    """Entero Magnus -> 'YYYY-MM-DD'. Se convierte en PYTHON, no en SQL (ver
    el gotcha del docstring). None si el dato es basura."""
    try:
        return (BASE_DATE + timedelta(days=int(n))).isoformat()
    except (TypeError, ValueError, OverflowError):
        return None


def _txt(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _num(v) -> float:
    return round(float(_safe(v) or 0), 2)


SQL = """
SELECT p.NroPresupuesto, p.CompCentro, p.CompNumero, p.FechaPres,
       p.FechaValidez, p.ValidesOferta, p.Estado, p.MotivoCancel,
       p.CodCliente, cli.RazonSocial,
       p.Vendedor, v.VendedorNombre,
       p.CondicionVenta, cv.Nombre,
       p.CodForPago, fp.Detalle, p.FormaPago,
       p.CodTransporte, tr.Nombre,
       p.ListaPrecio, p.Neto, p.IVA, p.Total, p.Impreso,
       p.LuigarEntrega, p.PlazoEntrega,
       r.NroRenglon, r.CodArticulo, r.DetalleArtPat,
       r.Cantidad, r.CantidadPedida, r.Cantidad_a_Pedir,
       r.PrecioLista, r.Bonificacion, r.PrecioVtaUniSinImp
FROM Pre_PresupCab p
JOIN Pre_PresupReng r            ON r.NroPresupuesto = p.NroPresupuesto
LEFT JOIN Ven_Clientes cli       ON cli.CodCliente = p.CodCliente
LEFT JOIN MAGNUS_SITD.dbo.Vendedores v ON v.VendedorCodigo = p.Vendedor
LEFT JOIN Ven_CondicionVenta cv  ON cv.CondicionVenta = p.CondicionVenta
LEFT JOIN Ven_TipoFormaPago fp   ON fp.CodForPago = p.CodForPago
LEFT JOIN Ven_CliTrasnsporte tr  ON tr.CodTransporte = p.CodTransporte
WHERE p.CodComp = ?
  AND p.FechaPres BETWEEN ? AND ?
{extra}
ORDER BY p.FechaPres DESC, p.NroPresupuesto DESC, r.NroRenglon
"""


def fetch_presupuestos_bulones(vendedor: int | None = None,
                               desde: str | None = None,
                               hasta: str | None = None,
                               forzar: bool = False) -> dict:
    """Presupuestos de bulonería del rango, con sus renglones y el resumen
    por estado. Una sola consulta: la cabecera viene repetida por renglón y
    se arma el árbol en Python (son pocos y evita dos viajes)."""
    d_ym, h_ym, d1, d2 = _rango(desde, hasta)
    key = ("presup45", vendedor, d_ym, h_ym)
    if not forzar:
        hit = _CACHE.get(key)
        if hit is not None and (time.monotonic() - hit[0]) < _TTL_SEG:
            return hit[1]

    extra = ""
    params: tuple = (COD_COMP, d1, d2)
    if vendedor is not None:
        extra = "  AND p.Vendedor = ?"
        params = (COD_COMP, d1, d2, int(vendedor))

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL.format(extra=extra), params)
        filas = cur.fetchmany(MAX_RENGLONES)
        truncado = len(cur.fetchmany(1)) > 0
    finally:
        conn.close()

    presus: dict[int, dict] = {}
    for f in filas:
        (nro, centro, numero, fec, fec_val, validez, estado, motivo,
         cod_cli, cliente, cod_ven, vendedor_nom, cod_cv, cond_vta,
         cod_fp, forma_pago, forma_pago_txt, cod_tr, transporte,
         lista, neto, iva, total, impreso, lugar, plazo,
         reng, cod_art, detalle, cant, pedida, a_pedir,
         precio_lista, bonif, precio) = f

        nro = int(nro)
        p = presus.get(nro)
        if p is None:
            estado_i = int(estado or 0)
            p = presus[nro] = {
                "nro": nro,
                "comprobante": f"{int(centro or 0):04d}-{int(numero or 0):08d}",
                "fecha": _fecha(fec),
                "validezHasta": _fecha(fec_val),
                "validezDias": int(validez or 0),
                "estado": estado_i,
                "estadoNombre": ESTADOS.get(estado_i, f"Estado {estado_i}"),
                "motivoCancel": int(motivo or 0) if estado_i == 2 else None,
                "codCliente": int(cod_cli or 0),
                "cliente": _txt(cliente),
                "codVendedor": int(cod_ven or 0),
                "vendedor": _txt(vendedor_nom),
                "condicionVenta": _txt(cond_vta),
                "codCondicionVenta": int(cod_cv or 0),
                # El texto libre de la cabecera (`FormaPago`) es lo que se
                # imprime; el maestro es el respaldo si viniera vacío.
                "formaPago": _txt(forma_pago_txt) or _txt(forma_pago),
                "transporte": _txt(transporte),
                "codTransporte": int(cod_tr or 0),
                "listaPrecio": int(lista or 0),
                "lugarEntrega": _txt(lugar),
                "plazoEntrega": _txt(plazo),
                "neto": _num(neto),
                "iva": _num(iva),
                "total": _num(total),
                "impreso": bool(impreso),
                "unidades": 0.0,
                "unidadesPendientes": 0.0,
                "pendiente": 0.0,
                "renglones": [],
            }

        cant_f = float(_safe(cant) or 0)
        pend_f = float(_safe(a_pedir) or 0)
        precio_f = float(_safe(precio) or 0)
        p["renglones"].append({
            "n": int(reng or 0),
            "codigo": _txt(cod_art),
            "detalle": _txt(detalle),
            "cantidad": round(cant_f, 3),
            "entregada": round(float(_safe(pedida) or 0), 3),
            "pendiente": round(pend_f, 3),
            "precioLista": _num(precio_lista),
            "bonificacion": _num(bonif),
            "precio": round(precio_f, 4),
            "importe": round(cant_f * precio_f, 2),
            "importePendiente": round(pend_f * precio_f, 2),
        })
        p["unidades"] = round(p["unidades"] + cant_f, 3)
        p["unidadesPendientes"] = round(p["unidadesPendientes"] + pend_f, 3)
        p["pendiente"] = round(p["pendiente"] + pend_f * precio_f, 2)

    items = list(presus.values())

    # Resumen por estado — se devuelven SIEMPRE los cuatro estados, aunque
    # vengan en cero: el front dibuja una tabla por estado y necesita saber
    # que existe para poder mostrarla vacía en vez de "desaparecerla".
    por_estado = []
    for cod, nombre in ESTADOS.items():
        grupo = [p for p in items if p["estado"] == cod]
        por_estado.append({
            "estado": cod,
            "nombre": nombre,
            "cantidad": len(grupo),
            "renglones": sum(len(p["renglones"]) for p in grupo),
            "neto": round(sum(p["neto"] for p in grupo), 2),
            "total": round(sum(p["total"] for p in grupo), 2),
            "unidades": round(sum(p["unidades"] for p in grupo), 2),
            "pendiente": round(sum(p["pendiente"] for p in grupo), 2),
        })

    resp = {
        "desde": f"{d_ym[0]:04d}-{d_ym[1]:02d}",
        "hasta": f"{h_ym[0]:04d}-{h_ym[1]:02d}",
        "truncado": truncado,
        "resumen": {
            "cantidad": len(items),
            "renglones": sum(len(p["renglones"]) for p in items),
            "neto": round(sum(p["neto"] for p in items), 2),
            "total": round(sum(p["total"] for p in items), 2),
            "unidades": round(sum(p["unidades"] for p in items), 2),
            "pendiente": round(sum(p["pendiente"] for p in items), 2),
        },
        "porEstado": por_estado,
        "presupuestos": items,
    }
    _CACHE[key] = (time.monotonic(), resp)
    return resp

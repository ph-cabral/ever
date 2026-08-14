"""
Clientes (Magnus, SOLO LECTURA).

Lookup por número de cliente para /manguera/corte. Solo se necesita número y
nombre. A Magnus nunca se le escribe.

Tabla (MAGNUS_SITD, misma usada en el JOIN de indicadores):
  · MAGNUS_SITD.dbo.Clientes → CodCliente, Cliente_Nombre
"""
from db import get_connection

SQL_CLIENTE = """
SELECT TOP 1
    c.CodCliente                    AS numero,
    LTRIM(RTRIM(c.Cliente_Nombre))  AS nombre
FROM MAGNUS_SITD.dbo.Clientes c
WHERE c.CodCliente = ?
"""


def fetch_cliente(numero: int):
    """Devuelve {'numero': int, 'nombre': str} o None si no existe."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_CLIENTE, (int(numero),))
        row = cur.fetchone()
        if not row:
            return None
        cols = [d[0] for d in cur.description]
        d = dict(zip(cols, row))
        nombre = d.get("nombre")
        return {
            "numero": int(d["numero"]),
            "nombre": str(nombre).strip() if nombre is not None else None,
        }
    finally:
        conn.close()


# Búsqueda por código (substring numérico) o nombre (substring) — para el
# filtro de clientes de /ventas/vendedor (pedido de Pablo 2026-08-14). A
# diferencia de fetch_cliente (lookup exacto por número), esto alimenta un
# autocomplete: el usuario tipea parte del código o parte del nombre y elige
# de la lista antes de "Filtrar".
SQL_CLIENTES_SEARCH = """
SELECT TOP ({limit})
    c.CodCliente                    AS numero,
    LTRIM(RTRIM(c.Cliente_Nombre))  AS nombre
FROM MAGNUS_SITD.dbo.Clientes c
WHERE CAST(c.CodCliente AS varchar(20)) LIKE ? OR c.Cliente_Nombre LIKE ?
ORDER BY c.Cliente_Nombre
"""


# ── Vendedor FIJO de un cliente (maestro Magnus) — acceso por vendedor de
# /ventas/vendedor ──────────────────────────────────────────────────────────
#
# CONFIRMADO 2026-08-14 (bug reportado por Pablo: buscó el cliente 7955 con
# un usuario asignado al vendedor Beccaria Gerardo y no lo encontró, aunque
# en la UI real de Magnus ("Cambiando Cliente" → solapa "Vendedores y
# Zonas") ese cliente tiene "Vendedor por Defecto: 13 BECCARIA GERARDO").
# Se investigó con 3 scripts (inspeccion_vendedor_cliente.py,
# inspeccion_vendedor_zona.py, inspeccion_vendedor_codigos.py — en la raíz
# de vicki, resultados en los .txt homónimos) y el join real es:
#
#   Clientes.Clasif_VendZona (char(20), ej. "13-83", código compuesto
#     zona-vendedor — el "13" NO es el código de vendedor, es coincidencia)
#     = Vendedor_Zona.Clasif_VendZona
#   → Vendedor_Zona.Vendedor            (¡es el NOMBRE del vendedor,
#     char(30), no un código!, ej. "BECCARIA GERARDO")
#
# Para convertir ese nombre a un CÓDIGO hay DOS maestros de vendedor en
# Magnus con el MISMO rango de códigos pero PERSONAS DISTINTAS en cada
# código — ej. código 13: en `Vendedores` es "BECCARIA GERARDO", pero en
# `Ped_Usu_Arma` es "Vaca Marcela" (el código de Beccaria en Ped_Usu_Arma es
# 6). Como el resto del sistema (usuario.vendedorCodigo asignado en
# /admin/usuarios, Ven_CompCabecera.vendedor, fetch_vendedores() más abajo)
# usa SIEMPRE Ped_Usu_Arma, acá también hay que resolver por NOMBRE contra
# Ped_Usu_Arma.Usu_Arma_Nombre (no contra Vendedores) para que el código
# resultante sea el mismo que usuario.vendedorCodigo — si no, el chequeo de
# acceso nunca podría coincidir.
#
# Este campo fijo REEMPLAZA el criterio anterior (vendedor más frecuente en
# el historial de Ven_CompCabecera): esa derivación podía dar un vendedor
# distinto al "Vendedor por Defecto" real del maestro (ventas viejas
# cargadas por otra persona, cambios de zona/vendedor a lo largo del tiempo,
# etc. — exactamente lo que pasó con el cliente 7955).
SQL_CLIENTES_SEARCH_POR_VENDEDOR = """
SELECT TOP ({limit})
    c.CodCliente                    AS numero,
    LTRIM(RTRIM(c.Cliente_Nombre))  AS nombre
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
WHERE (CAST(c.CodCliente AS varchar(20)) LIKE ? OR c.Cliente_Nombre LIKE ?)
  AND pu.Usu_Arma_Codigo = ?
ORDER BY c.Cliente_Nombre
"""

SQL_VENDEDOR_FIJO_CLIENTE = """
SELECT pu.Usu_Arma_Codigo
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
WHERE c.CodCliente = ?
"""


def fetch_vendedor_fijo_cliente(cod_cliente: int) -> int | None:
    """Código de vendedor (Ped_Usu_Arma.Usu_Arma_Codigo) del "Vendedor por
    Defecto" de UN cliente, según el maestro de Magnus (ver nota arriba
    sobre el join real). `None` si el cliente no tiene Clasif_VendZona, no
    matchea ninguna fila de Vendedor_Zona, o el nombre no matchea ningún
    Usu_Arma_Nombre (clientes de mostrador/casa central, ej. Vendedor_Zona.
    Vendedor = "MOSTRADORES"/"SIN VENDEDOR" — no le pertenecen a ningún
    vendedor individual, un admin los sigue viendo igual).

    Usado por ventas.py (fetch_ventas_por_linea) para el chequeo de acceso
    por vendedor — mismo criterio que fetch_clientes_search, para que un
    cliente que aparece en el buscador de un vendedor nunca sea rechazado
    después al pedir el detalle (antes eran dos criterios distintos y
    podían no coincidir)."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_VENDEDOR_FIJO_CLIENTE, (int(cod_cliente),))
        row = cur.fetchone()
        if not row or row[0] is None:
            return None
        return int(row[0])
    finally:
        conn.close()


def fetch_clientes_search(q: str, limit: int = 20, vendedor: int | None = None):
    """Devuelve hasta `limit` clientes {'numero', 'nombre'} que matchean `q`
    por código o por nombre (substring, no exacto). Lista vacía si `q` está
    vacío — no se trae el padrón completo de clientes por accidente.

    `vendedor` (pedido de Pablo 2026-08-14, acceso por vendedor en
    /ventas/vendedor): si se pasa, SOLO devuelve clientes cuyo "Vendedor por
    Defecto" fijo (ver SQL_CLIENTES_SEARCH_POR_VENDEDOR arriba) coincide —
    filtrado server-side en el mismo SELECT, no hay pool ni post-filtrado en
    Python. Un usuario no-admin nunca debe ni siquiera ENCONTRAR en el
    buscador un cliente que no es suyo. Admins llaman sin `vendedor` (ven
    todos)."""
    texto = (q or "").strip()
    if not texto:
        return []
    like = f"%{texto}%"
    limit_i = max(1, min(int(limit or 20), 50))
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        if vendedor is None:
            cur.execute(SQL_CLIENTES_SEARCH.format(limit=limit_i), (like, like))
        else:
            cur.execute(
                SQL_CLIENTES_SEARCH_POR_VENDEDOR.format(limit=limit_i),
                (like, like, int(vendedor)),
            )
        cols = [d[0] for d in cur.description]
        out = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            nombre = d.get("nombre")
            out.append({
                "numero": int(d["numero"]),
                "nombre": str(nombre).strip() if nombre is not None else None,
            })
        return out
    finally:
        conn.close()

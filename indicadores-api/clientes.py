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


# ── Vendedor "principal" de un cliente — acceso por vendedor de /ventas/vendedor ──
#
# PROVISORIO (2026-08-14, pedido de Pablo): Pablo pidió filtrar clientes por
# "el vendedor del cliente", pero no hay (todavía confirmado) un campo fijo
# de vendedor asignado en MAGNUS_SITD.dbo.Clientes — se le pasó un script de
# inspección (inspeccion_vendedor_cliente.py, en la raíz de vicki) para
# confirmarlo. Mientras tanto, "vendedor del cliente" se DERIVA del
# historial de ventas: el código de vendedor (Ven_CompCabecera.vendedor) que
# más aparece en los comprobantes de ese cliente (empate → cualquiera de los
# empatados, no afecta el resultado práctico). Si el script confirma un
# campo fijo en Clientes, esto se reemplaza por ese campo directamente (más
# simple y más barato) sin tocar las firmas de fetch_clientes_search /
# fetch_ventas_por_linea ni los endpoints — solo esta función.
SQL_VENDEDOR_POR_CLIENTES = """
SELECT c.CodCliente, c.vendedor, COUNT(*) AS Cantidad
FROM Ven_CompCabecera c
WHERE c.CodCliente IN ({ph})
GROUP BY c.CodCliente, c.vendedor
"""


def _vendedor_principal_por_cliente(cur, codigos: list[int]) -> dict[int, int | None]:
    """Para cada CodCliente en `codigos`: el código de vendedor que más se
    repite en Ven_CompCabecera.vendedor (o None si no tiene comprobantes)."""
    if not codigos:
        return {}
    conteos: dict[int, dict[int, int]] = {}
    CH = 500
    for i in range(0, len(codigos), CH):
        chunk = codigos[i:i + CH]
        ph = ",".join("?" for _ in chunk)
        cur.execute(SQL_VENDEDOR_POR_CLIENTES.format(ph=ph), chunk)
        for cod_cli, vend, cant in cur.fetchall():
            if vend is None:
                continue
            try:
                cod_cli_i, vend_i, cant_i = int(cod_cli), int(vend), int(cant)
            except (TypeError, ValueError):
                continue
            d = conteos.setdefault(cod_cli_i, {})
            d[vend_i] = d.get(vend_i, 0) + cant_i
    return {cod: (max(d.items(), key=lambda kv: kv[1])[0] if d else None) for cod, d in conteos.items()}


def fetch_clientes_search(q: str, limit: int = 20, vendedor: int | None = None):
    """Devuelve hasta `limit` clientes {'numero', 'nombre'} que matchean `q`
    por código o por nombre (substring, no exacto). Lista vacía si `q` está
    vacío — no se trae el padrón completo de clientes por accidente.

    `vendedor` (pedido de Pablo 2026-08-14, acceso por vendedor en
    /ventas/vendedor): si se pasa, SOLO devuelve clientes cuyo "vendedor
    principal" (ver _vendedor_principal_por_cliente) coincide — un usuario
    no-admin nunca debe ni siquiera ENCONTRAR en el buscador un cliente que
    no es suyo. Admins llaman sin `vendedor` (ven todos)."""
    texto = (q or "").strip()
    if not texto:
        return []
    like = f"%{texto}%"
    limit_i = max(1, min(int(limit or 20), 50))
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        # Con filtro de vendedor, el pool de candidatos tiene que ser más
        # amplio que `limit` porque muchos se van a descartar después de
        # resolver el vendedor principal de cada uno.
        pool = limit_i if vendedor is None else max(limit_i * 10, 200)
        cur.execute(SQL_CLIENTES_SEARCH.format(limit=pool), (like, like))
        cols = [d[0] for d in cur.description]
        candidatos = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            nombre = d.get("nombre")
            candidatos.append({
                "numero": int(d["numero"]),
                "nombre": str(nombre).strip() if nombre is not None else None,
            })
        if vendedor is None:
            return candidatos[:limit_i]

        principal = _vendedor_principal_por_cliente(cur, [c["numero"] for c in candidatos])
        vendedor_i = int(vendedor)
        filtrados = [c for c in candidatos if principal.get(c["numero"]) == vendedor_i]
        return filtrados[:limit_i]
    finally:
        conn.close()

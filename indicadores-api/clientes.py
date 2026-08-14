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


def fetch_clientes_search(q: str, limit: int = 20):
    """Devuelve hasta `limit` clientes {'numero', 'nombre'} que matchean `q`
    por código o por nombre (substring, no exacto). Lista vacía si `q` está
    vacío — no se trae el padrón completo de clientes por accidente."""
    texto = (q or "").strip()
    if not texto:
        return []
    like = f"%{texto}%"
    limit_i = max(1, min(int(limit or 20), 50))
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_CLIENTES_SEARCH.format(limit=limit_i), (like, like))
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

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

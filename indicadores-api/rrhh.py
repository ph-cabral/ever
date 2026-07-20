"""
Reclutamiento: CVs recibidos por mes, desde Postgres schema rag_system
(tabla documento_aprobado, tipo='CV') — ver db_pg.py para la conexión
(mismo host/red que Prisma, n8n_sql:5432/n8n) y vicki_mail/app/db.py para
cómo se cargan esas filas (upsert_documento_cv, un CV por email procesado
por vicki_mail; aprobado_at = NOW() al momento de la ingesta automática,
se usa acá como fecha de "entrada" del CV).
"""
from db_pg import get_pg_connection

_SQL_CVS_POR_MES = """
    SELECT
        to_char(date_trunc('month', aprobado_at), 'YYYY-MM') AS mes,
        COUNT(*) AS cantidad
    FROM rag_system.documento_aprobado
    WHERE tipo = 'CV'
      AND aprobado_at >= date_trunc('month', now()) - (%s || ' months')::interval
    GROUP BY 1
    ORDER BY 1
"""


def fetch_cvs_por_mes(meses: int = 12) -> dict:
    """CVs (tipo='CV') agrupados por mes de aprobado_at, últimos `meses` meses
    (incluye el mes actual)."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(_SQL_CVS_POR_MES, (meses,))
        rows = [{"mes": mes, "cantidad": cantidad} for mes, cantidad in cur.fetchall()]
    finally:
        conn.close()
    return {
        "meses": meses,
        "total": sum(r["cantidad"] for r in rows),
        "rows": rows,
    }

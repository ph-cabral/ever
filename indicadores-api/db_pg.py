"""
Conexión a Postgres (n8n_sql:5432/n8n, red ai-net) — para escribir en schema
`deposito` (ver ever/sql/deposito_errores_mesa.sql). Todo lo demás en esta API
lee SOLO Magnus/WMS (SQL Server, ver db.py); este es el único módulo que
escribe, y solo en Postgres.

Requiere POSTGRES_DSN en indicadores-api/.env (no está en git — agregarlo a
mano en el .env del server), ej:
  POSTGRES_DSN=postgresql://usuario:password@n8n_sql:5432/n8n
(mismo host/red que usa Prisma en ever/.env vía DATABASE_URL — reusar
usuario/password de ahí, cambiando solo el host a n8n_sql y la db a n8n).
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_pg_connection():
    dsn = os.getenv("POSTGRES_DSN")
    if not dsn:
        raise RuntimeError("Falta POSTGRES_DSN en el .env de indicadores-api")
    return psycopg2.connect(dsn)

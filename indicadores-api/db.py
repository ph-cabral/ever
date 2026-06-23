import pyodbc
import os
from dotenv import load_dotenv

load_dotenv()

def get_connection(database: str | None = None):
    server   = os.getenv("SQL_SERVER")
    database = database or os.getenv("SQL_DATABASE")
    ccname   = os.getenv("KRB5_CCNAME", "/tmp/krb5cc_1000")

    os.environ["KRB5CCNAME"] = ccname

    conn_str = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={server};"
        f"DATABASE={database};"
        "Trusted_Connection=yes;"
        "TrustServerCertificate=yes;"
    )
    return pyodbc.connect(conn_str)


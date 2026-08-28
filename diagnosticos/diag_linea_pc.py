"""
Diagnóstico focalizado: por qué `clientes-por-linea` tarda 4.6 s (pc-013).

Es el único endpoint lento de /ventas/vendedor. Este script:
  1. corre `fetch_clientes_por_linea` espiando el cursor, para separar
     SQL puro (execute + fetchall) del armado en Python;
  2. vuelve a correr ESA MISMA query con SET STATISTICS PROFILE ON y muestra
     el plan real (filas por operador, seek vs scan);
  3. imprime el SQL completo al final, para poder reescribirlo.

    cd C:\\Users\\cabralp\\Desktop\\projects\\vicki\\vicki_web\\indicadores-api
    export EVERWEAR_ADMIN_PWD='...'
    python diag_linea_pc.py > diag_linea_pc.txt 2>&1

Opcional: `python diag_linea_pc.py "NOMBRE DE LINEA"` para probar otra línea
(por defecto PRECINTOS, la más grande del ranking).

Solo lee.
"""

import os
import sys
import time
import types
import traceback

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

LINEA = sys.argv[1] if len(sys.argv) > 1 else "PRECINTOS"
SERVER = os.getenv("SQL_SERVER", "10.10.0.235")

_CAND = []
try:
    _CAND.append(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    pass
_CAND += [os.getcwd(),
          os.path.join(os.getcwd(), "indicadores-api"),
          r"C:\Users\cabralp\Desktop\projects\vicki\vicki_web\indicadores-api"]
BASE = None
for _d in _CAND:
    if os.path.isfile(os.path.join(_d, "ventas.py")):
        BASE = _d
        if _d not in sys.path:
            sys.path.insert(0, _d)
        break
if BASE is None:
    print("ERROR: no encuentro ventas.py. Correlo parado en indicadores-api.")
    raise SystemExit(1)
print(f"repo: {BASE}")

try:
    import dotenv  # noqa: F401
except ImportError:
    m = types.ModuleType("dotenv")
    m.load_dotenv = lambda *a, **k: None
    sys.modules["dotenv"] = m

import pyodbc  # noqa: E402


def _driver():
    dr = pyodbc.drivers()
    for pref in ("ODBC Driver 18 for SQL Server",
                 "ODBC Driver 17 for SQL Server",
                 "SQL Server Native Client 11.0",
                 "SQL Server"):
        if pref in dr:
            return pref
    raise RuntimeError(f"no hay driver ODBC. Instalados: {dr}")


DRIVER = _driver()
print(f"driver: {{{DRIVER}}}   server: {SERVER}")
_IMPERSONADO = False


def _impersonar():
    global _IMPERSONADO
    pwd = os.getenv("EVERWEAR_ADMIN_PWD")
    if not pwd or _IMPERSONADO:
        return False
    import win32con
    import win32security
    h = win32security.LogonUser("administrador", "EVERWEAR", pwd,
                                win32con.LOGON32_LOGON_NEW_CREDENTIALS,
                                win32con.LOGON32_PROVIDER_DEFAULT)
    win32security.ImpersonateLoggedOnUser(h)
    _IMPERSONADO = True
    print("(impersonando EVERWEAR\\administrador)")
    return True


def _conectar(database="EVERWEAR"):
    cs = (f"DRIVER={{{DRIVER}}};SERVER={SERVER};DATABASE={database};"
          "Trusted_Connection=yes;")
    if DRIVER.startswith("ODBC Driver 1"):
        cs += "TrustServerCertificate=yes;"
    try:
        return pyodbc.connect(cs)
    except pyodbc.Error:
        if _impersonar():
            return pyodbc.connect(cs)
        raise


# ── espía: guarda la última query grande y cuánto tardó en la base ─────────
CAPTURA = {"sql": None, "params": None, "t_execute": 0.0, "t_fetch": 0.0}


class CursorEspia:
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, *params):
        t0 = time.perf_counter()
        r = self._cur.execute(sql, *params)
        dt = time.perf_counter() - t0
        if len(sql) > 400:  # las de verdad, no los SET
            CAPTURA["sql"] = sql
            CAPTURA["params"] = params[0] if params else None
            CAPTURA["t_execute"] = dt
        return r

    def fetchall(self):
        t0 = time.perf_counter()
        filas = self._cur.fetchall()
        CAPTURA["t_fetch"] += time.perf_counter() - t0
        return filas

    def __getattr__(self, n):
        return getattr(self._cur, n)

    def __iter__(self):
        return iter(self._cur)


class ConexionEspia:
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return CursorEspia(self._conn.cursor())

    def __getattr__(self, n):
        return getattr(self._conn, n)


import ventas as V  # noqa: E402

V.get_connection = lambda db=None: ConexionEspia(_conectar(db or "EVERWEAR"))


def main():
    print("=" * 78)
    print(f"clientes-por-linea — línea '{LINEA}'")
    print("=" * 78)

    t0 = time.perf_counter()
    try:
        r = V.fetch_clientes_por_linea(LINEA, None, forzar=True)
    except Exception:
        traceback.print_exc()
        return
    total = time.perf_counter() - t0
    n = len(r.get("clientes") or [])

    print(f"\n  total del endpoint      : {total:7.2f} s   ({n} clientes)")
    print(f"  de eso, SQL (execute)   : {CAPTURA['t_execute']:7.2f} s")
    print(f"  de eso, traer filas     : {CAPTURA['t_fetch']:7.2f} s")
    resto = total - CAPTURA["t_execute"] - CAPTURA["t_fetch"]
    print(f"  de eso, Python (armado) : {resto:7.2f} s")

    if not CAPTURA["sql"]:
        print("\n(no se capturó la query — revisar el espía)")
        return

    # ── plan real con STATISTICS PROFILE (funciona con el driver viejo) ────
    print("\n--- PLAN REAL (STATISTICS PROFILE) ---")
    conn = _conectar("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute("SET STATISTICS PROFILE ON;")
        if CAPTURA["params"]:
            cur.execute(CAPTURA["sql"], CAPTURA["params"])
        else:
            cur.execute(CAPTURA["sql"])

        plan = None
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                filas = cur.fetchall()
                if "StmtText" in cols or "Rows" in cols:
                    plan = (cols, filas)
            if not cur.nextset():
                break
        cur.execute("SET STATISTICS PROFILE OFF;")

        if not plan:
            print("  (el driver no devolvió el plan)")
        else:
            cols, filas = plan
            ix = {c: i for i, c in enumerate(cols)}
            print(f"  {'filas':>12} {'ejec':>7} {'est':>12}  operador")
            for f in filas:
                txt = (f[ix["StmtText"]] or "").rstrip()
                sangria = len(txt) - len(txt.lstrip())
                txt = " " * min(sangria, 20) + txt.strip()
                rows = f[ix["Rows"]] if "Rows" in ix else ""
                ejec = f[ix["Executes"]] if "Executes" in ix else ""
                est = f[ix["EstimateRows"]] if "EstimateRows" in ix else ""
                try:
                    rows = f"{int(rows):,}"
                except Exception:
                    rows = str(rows)
                try:
                    est = f"{float(est):,.0f}"
                except Exception:
                    est = str(est)
                marca = ""
                if "Scan" in txt and "Index Seek" not in txt:
                    marca = "   <== SCAN"
                print(f"  {rows:>12} {str(ejec):>7} {est:>12}  {txt[:150]}{marca}")
    except Exception:
        traceback.print_exc()
    finally:
        conn.close()

    print("\n--- SQL EJECUTADO ---")
    print(f"params: {CAPTURA['params']}")
    print(CAPTURA["sql"])
    print("\n" + "=" * 78)


if __name__ == "__main__":
    main()

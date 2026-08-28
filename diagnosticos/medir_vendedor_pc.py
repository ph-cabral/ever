"""
Desempate: en el caso VENDEDOR, ¿la forma nueva es mejor o peor?

En la verificación el caso admin mejoró 2,2x–9,4x, pero el caso vendedor dio
mezclado (0,6x a 1,3x)... y `(Sin línea)`, que NI SIQUIERA cambió de camino,
"mejoró" 1,5x. O sea: una sola corrida por variante es puro ruido.

Acá se alterna vieja/nueva 3 veces cada una por línea y se reporta el MÍNIMO
(el número menos contaminado por caché y red).

    cd C:\\Users\\cabralp\\Desktop\\projects\\vicki\\vicki_web\\indicadores-api
    export EVERWEAR_ADMIN_PWD='...'
    python medir_vendedor_pc.py > medir_vendedor_pc.txt 2>&1

Solo lee.
"""

import os
import sys
import time
import types
import traceback
from datetime import date

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

VUELTAS = 3
SERVER = os.getenv("SQL_SERVER", "10.10.0.235")

_CAND = []
try:
    _CAND.append(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    pass
_CAND += [os.getcwd(), r"C:\Users\cabralp\Desktop\projects\vicki\vicki_web\indicadores-api"]
BASE = None
for _d in _CAND:
    if os.path.isfile(os.path.join(_d, "ventas.py")):
        BASE = _d
        if _d not in sys.path:
            sys.path.insert(0, _d)
        break
if BASE is None:
    print("ERROR: no encuentro ventas.py.")
    raise SystemExit(1)

try:
    import dotenv  # noqa: F401
except ImportError:
    m = types.ModuleType("dotenv")
    m.load_dotenv = lambda *a, **k: None
    sys.modules["dotenv"] = m

import pyodbc  # noqa: E402


def _driver():
    for p in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server",
              "SQL Server Native Client 11.0", "SQL Server"):
        if p in pyodbc.drivers():
            return p
    raise RuntimeError(f"sin driver ODBC: {pyodbc.drivers()}")


DRIVER = _driver()
_IMP = False


def _impersonar():
    global _IMP
    pwd = os.getenv("EVERWEAR_ADMIN_PWD")
    if not pwd or _IMP:
        return False
    import win32con
    import win32security
    h = win32security.LogonUser("administrador", "EVERWEAR", pwd,
                                win32con.LOGON32_LOGON_NEW_CREDENTIALS,
                                win32con.LOGON32_PROVIDER_DEFAULT)
    win32security.ImpersonateLoggedOnUser(h)
    _IMP = True
    return True


def conectar(database=None):
    cs = (f"DRIVER={{{DRIVER}}};SERVER={SERVER};DATABASE={database or 'EVERWEAR'};"
          "Trusted_Connection=yes;")
    if DRIVER.startswith("ODBC Driver 1"):
        cs += "TrustServerCertificate=yes;"
    try:
        return pyodbc.connect(cs)
    except pyodbc.Error:
        if _impersonar():
            return pyodbc.connect(cs)
        raise


import ventas as V  # noqa: E402
from cartera import params_cartera  # noqa: E402

V.get_connection = conectar

HOY = date.today()
A_ACT, A_ANT = HOY.year, HOY.year - 1
D1 = (date(A_ANT, 1, 1) - V.BASE_DATE).days
D2 = (date(A_ACT, 12, 31) - V.BASE_DATE).days
CASE_AM = V._case_anio_mes((A_ANT, A_ACT))


def sql_viejo(linea, vendedor):
    tpl = (V._SUB_CLIENTES_LINEA_TODOS_TPL if vendedor is None
           else V._SUB_CLIENTES_LINEA_VENDEDOR_TPL)
    sub = tpl.format(case_anio_mes=CASE_AM, linea_cond=V._LINEA_COND_EXACTA)
    params = (D1, D2, linea)
    if vendedor is not None:
        params = params_cartera(vendedor) + params
    return V.SQL_CLIENTES_LINEA_WRAP.format(sub=sub), params


def sql_nuevo(linea, vendedor):
    tpl = (V._SUB_CLIENTES_LINEA_TODOS_ART_TPL if vendedor is None
           else V._SUB_CLIENTES_LINEA_VENDEDOR_ART_TPL)
    sub = tpl.format(case_anio_mes=CASE_AM, linea_cond=V._LINEA_COND_EXACTA)
    m = V._MARGEN_FECHA_RENGLON
    params = (linea,)
    if vendedor is not None:
        params += params_cartera(vendedor)
    params += (D1 - m, D2 + m, D1, D2)
    return V.SQL_CLIENTES_LINEA_WRAP.format(sub=sub), params


def correr(conn, sql, params):
    cur = conn.cursor()
    t0 = time.perf_counter()
    cur.execute(sql, params)
    n = len(cur.fetchall())
    return time.perf_counter() - t0, n


def main():
    print("=" * 78)
    print(f"VIEJO vs NUEVO — {VUELTAS} corridas alternadas, se reporta el MÍNIMO")
    print("=" * 78)

    top = V.fetch_top_lineas(None, forzar=True)
    lineas = [x["linea"] for x in (top.get("porMonto") or [])][:6]
    vends = V.fetch_vendedores()
    vend = next((int(v["codigo"]) for v in vends if v.get("activo")), None)
    print(f"vendedor: {vend}\n")

    conn = conectar("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        for etiqueta, v in (("ADMIN", None), (f"VENDEDOR {vend}", vend)):
            print(f"--- {etiqueta} ---")
            print(f"  {'línea':30} {'viejo':>8} {'nuevo':>8} {'x':>6}  filas")
            tot_v = tot_n = 0.0
            for linea in lineas:
                try:
                    sv, pv = sql_viejo(linea, v)
                    sn, pn = sql_nuevo(linea, v)
                    tv, tn, nf = [], [], 0
                    for _ in range(VUELTAS):
                        a, nf = correr(conn, sv, pv)
                        b, _ = correr(conn, sn, pn)
                        tv.append(a)
                        tn.append(b)
                    mv, mn = min(tv), min(tn)
                    tot_v += mv
                    tot_n += mn
                    print(f"  {linea[:30]:30} {mv:8.2f} {mn:8.2f} {mv / mn:5.1f}x  {nf:,}")
                except Exception:
                    print(f"  {linea[:30]:30}  ERROR")
                    traceback.print_exc()
            if tot_n:
                print(f"  {'TOTAL':30} {tot_v:8.2f} {tot_n:8.2f} {tot_v / tot_n:5.1f}x\n")
    finally:
        conn.close()
    print("=" * 78)


if __name__ == "__main__":
    main()

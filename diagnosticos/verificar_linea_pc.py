"""
Verificación del cambio en clientes-por-linea (pc-013, 2026-08-26).

`ventas.py` ahora resuelve primero los artículos de la línea y entra a
Ven_CompRenglon por seek. Este script corre, para las N líneas más grandes
(más SIN_LINEA, que sigue por el camino viejo):

    forma vieja (SQL armado acá)   vs   fetch_clientes_por_linea (la nueva)

y compara CLIENTE POR CLIENTE Y MES POR MES. Si alguna da distinto, lo dice y
muestra los primeros casos. También reporta el tiempo de cada una.

    cd C:\\Users\\cabralp\\Desktop\\projects\\vicki\\vicki_web\\indicadores-api
    export EVERWEAR_ADMIN_PWD='...'
    python verificar_linea_pc.py > verificar_linea_pc.txt 2>&1

Opcional: `python verificar_linea_pc.py 5` para probar solo 5 líneas.
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

N_LINEAS = int(sys.argv[1]) if len(sys.argv) > 1 else 8
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
print(f"repo: {BASE}")

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
    print("(impersonando EVERWEAR\\administrador)")
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


# ── forma VIEJA, armada acá con los templates que quedaron en el módulo ────
def viejo(linea, vendedor=None):
    from datetime import date
    hoy = date.today()
    a_act, a_ant = hoy.year, hoy.year - 1
    d1 = (date(a_ant, 1, 1) - V.BASE_DATE).days
    d2 = (date(a_act, 12, 31) - V.BASE_DATE).days
    sin_linea = linea == V.SIN_LINEA
    cond = V._LINEA_COND_SIN_LINEA if sin_linea else V._LINEA_COND_EXACTA
    case_am = V._case_anio_mes((a_ant, a_act))
    tpl = (V._SUB_CLIENTES_LINEA_TODOS_TPL if vendedor is None
           else V._SUB_CLIENTES_LINEA_VENDEDOR_TPL)
    sub = tpl.format(case_anio_mes=case_am, linea_cond=cond)
    params = (d1, d2) if sin_linea else (d1, d2, linea)
    if vendedor is not None:
        params = params_cartera(vendedor) + params

    conn = conectar("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        t0 = time.perf_counter()
        cur.execute(V.SQL_CLIENTES_LINEA_WRAP.format(sub=sub), params)
        filas = cur.fetchall()
        dt = time.perf_counter() - t0
    finally:
        conn.close()

    d = {}
    for cod, _nombre, am, cant, monto in filas:
        if cod is None or am is None:
            continue
        d[(int(cod), int(am))] = (round(float(cant or 0), 2),
                                  round(float(monto or 0), 2))
    return d, dt


# ── forma NUEVA: lo que devuelve el endpoint, aplanado igual ──────────────
def nuevo(linea, vendedor=None):
    t0 = time.perf_counter()
    r = V.fetch_clientes_por_linea(linea, vendedor, forzar=True)
    dt = time.perf_counter() - t0
    d = {}
    for b in r.get("clientes", []):
        cod = int(b["numero"])
        for clave, anio in (("anioAnterior", r["anioAnterior"]),
                            ("anioActual", r["anioActual"])):
            for i, mes in enumerate(b[clave]["meses"], start=1):
                c, mo = round(float(mes["cantidad"]), 2), round(float(mes["monto"]), 2)
                if c or mo:
                    d[(cod, anio * 100 + i)] = (c, mo)
    return d, dt, r


def comparar(a, b):
    """a=viejo, b=nuevo. Ignora entradas en cero de un solo lado."""
    a = {k: v for k, v in a.items() if v != (0.0, 0.0)}
    b = {k: v for k, v in b.items() if v != (0.0, 0.0)}
    faltan = sorted(set(a) - set(b))
    sobran = sorted(set(b) - set(a))
    difs = sorted(k for k in (set(a) & set(b)) if a[k] != b[k])
    return faltan, sobran, difs, a, b


def main():
    print("=" * 78)
    print("VERIFICACIÓN — clientes-por-linea viejo vs nuevo")
    print("=" * 78)

    top = V.fetch_top_lineas(None, forzar=True)
    lineas = [x["linea"] for x in (top.get("porMonto") or [])][:N_LINEAS]
    if V.SIN_LINEA not in lineas:
        lineas.append(V.SIN_LINEA)

    vends = V.fetch_vendedores()
    vend = next((int(v["codigo"]) for v in vends if v.get("activo")), None)
    print(f"\nlíneas a probar: {lineas}")
    print(f"vendedor de prueba: {vend}\n")

    fallas = 0
    print(f"  {'línea':28} {'vend':>5} {'viejo':>8} {'nuevo':>8} {'x':>5}  resultado")
    for linea in lineas:
        for v in (None, vend):
            try:
                va, ta = viejo(linea, v)
                nb, tb, _ = nuevo(linea, v)
                faltan, sobran, difs, va2, nb2 = comparar(va, nb)
                ok = not (faltan or sobran or difs)
                if not ok:
                    fallas += 1
                estado = ("IDÉNTICO ✔" if ok else
                          f"DISTINTO ✘ faltan={len(faltan)} sobran={len(sobran)} difs={len(difs)}")
                x = f"{ta / tb:.1f}x" if tb > 0 else ""
                print(f"  {str(linea)[:28]:28} {str(v or 'adm'):>5} {ta:8.2f} {tb:8.2f} {x:>5}  {estado}")
                if not ok:
                    for k in faltan[:3]:
                        print(f"      solo viejo: cliente {k[0]} mes {k[1]} -> {va2[k]}")
                    for k in sobran[:3]:
                        print(f"      solo nuevo: cliente {k[0]} mes {k[1]} -> {nb2[k]}")
                    for k in difs[:3]:
                        print(f"      cliente {k[0]} mes {k[1]}: viejo={va2[k]} nuevo={nb2[k]}")
            except Exception:
                fallas += 1
                print(f"  {str(linea)[:28]:28} {str(v or 'adm'):>5}  ERROR")
                traceback.print_exc()

    print("\n" + "=" * 78)
    print("TODAS IGUALES ✔" if fallas == 0 else f"HAY {fallas} CASOS CON PROBLEMA ✘")
    print("=" * 78)


if __name__ == "__main__":
    main()

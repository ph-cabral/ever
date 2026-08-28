"""
Diagnóstico de performance de /ventas/vendedor — versión PC (pc-013).

Corre en la PC de la LAN, sin docker, como los scripts de inspección de
siempre. Se apoya en el repo que está al lado (importa `ventas.py` en vez de
copiar las queries, así no se desincroniza) y reemplaza la conexión Kerberos
del contenedor por la de Windows.

    cd C:\\Users\\cabralp\\Desktop\\projects\\vicki\\vicki_web\\indicadores-api
    python diag_perf_pc.py > diag_perf_pc.txt 2>&1

Si el login falla con 18456 (el usuario de Windows no tiene login en el SQL),
setear la password del administrador y volver a correr:

    set EVERWEAR_ADMIN_PWD=loquesea
    python diag_perf_pc.py > diag_perf_pc.txt 2>&1

Mide, con el cache desactivado (`forzar=True`):
  1. cuánto cuesta abrir la conexión,
  2. cada endpoint que la vista le pide al back — incluidos los pesados del
     modal (clientes-por-linea, ventas-por-linea),
  3. un resumen ordenado de peor a mejor.

Solo lee. No crea, no borra, no toca índices.
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

SERVER = os.getenv("SQL_SERVER", "10.10.0.235")

# ── 1. encontrar ventas.py (este script vive al lado) ──────────────────────
_CAND = []
try:
    _CAND.append(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    pass
_CAND += [
    os.getcwd(),
    os.path.join(os.getcwd(), "indicadores-api"),
    os.path.join(os.getcwd(), "vicki_web", "indicadores-api"),
    r"C:\Users\cabralp\Desktop\projects\vicki\vicki_web\indicadores-api",
]
BASE = None
for _d in _CAND:
    if os.path.isfile(os.path.join(_d, "ventas.py")):
        BASE = _d
        if _d not in sys.path:
            sys.path.insert(0, _d)
        break
if BASE is None:
    print("ERROR: no encuentro ventas.py. Buscé en:")
    for d in _CAND:
        print("   ", d)
    print("\nCorrelo parado en vicki_web\\indicadores-api.")
    raise SystemExit(1)
print(f"repo: {BASE}")

# dotenv puede no estar instalado en la PC — no hace falta acá
if "dotenv" not in sys.modules:
    try:
        import dotenv  # noqa: F401
    except ImportError:
        m = types.ModuleType("dotenv")
        m.load_dotenv = lambda *a, **k: None
        sys.modules["dotenv"] = m

import pyodbc  # noqa: E402


# ── 2. conexión Windows (reemplaza la Kerberos del contenedor) ─────────────
def _driver():
    dr = pyodbc.drivers()
    for pref in ("ODBC Driver 18 for SQL Server",
                 "ODBC Driver 17 for SQL Server",
                 "SQL Server Native Client 11.0",
                 "SQL Server"):
        if pref in dr:
            return pref
    raise RuntimeError(f"no hay driver ODBC de SQL Server. Instalados: {dr}")


DRIVER = _driver()
print(f"driver: {{{DRIVER}}}   server: {SERVER}")

_IMPERSONADO = False


def _impersonar_si_hace_falta():
    """El usuario de Windows logueado no tiene login en el SQL (error 18456);
    el acceso está dado a EVERWEAR\\administrador. Mismo truco que los scripts
    viejos, pero con la password por variable de entorno, no hardcodeada."""
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


def get_connection(database=None):
    database = database or "EVERWEAR"
    cs = (f"DRIVER={{{DRIVER}}};SERVER={SERVER};DATABASE={database};"
          "Trusted_Connection=yes;")
    if DRIVER.startswith("ODBC Driver 1"):
        cs += "TrustServerCertificate=yes;"
    try:
        return pyodbc.connect(cs)
    except pyodbc.Error:
        if _impersonar_si_hace_falta():
            return pyodbc.connect(cs)
        raise


import ventas as V  # noqa: E402

V.get_connection = get_connection  # las fetch_* usan esta


# ── 3. medición ────────────────────────────────────────────────────────────
RESULTADOS = []


def medir(etiqueta, fn):
    t0 = time.perf_counter()
    try:
        r = fn()
        dt = time.perf_counter() - t0
        detalle = ""
        if isinstance(r, dict):
            partes = []
            for k, v in r.items():
                if isinstance(v, list):
                    partes.append(f"{k}={len(v)}")
                elif isinstance(v, (int, float)) and k.lower().startswith("total"):
                    partes.append(f"{k}={v}")
            detalle = " ".join(partes[:4])
        elif isinstance(r, list):
            detalle = f"{len(r)} items"
        print(f"  {etiqueta:44} {dt:7.2f} s   {detalle}")
        RESULTADOS.append((etiqueta, dt))
        return r
    except Exception as e:
        dt = time.perf_counter() - t0
        print(f"  {etiqueta:44} {dt:7.2f} s   ERROR: {e}")
        traceback.print_exc()
        return None


def main():
    print("=" * 78)
    print("DÓNDE SE VA EL TIEMPO — /ventas/vendedor (desde la PC, sin cache)")
    print("=" * 78)

    print("\n--- 1. Abrir conexión (cada fetch abre la suya) ---")
    for i in range(3):
        try:
            t0 = time.perf_counter()
            c = get_connection("EVERWEAR")
            t1 = time.perf_counter()
            cur = c.cursor()
            cur.execute("SELECT 1")
            cur.fetchall()
            t2 = time.perf_counter()
            c.close()
            print(f"  intento {i+1}: connect {t1 - t0:6.2f} s   +  SELECT 1 {t2 - t1:6.2f} s")
        except Exception as e:
            print(f"  intento {i+1}: ERROR {e}")
            if "18456" in str(e):
                print("  → el usuario de Windows no tiene login en el SQL.")
                print("    set EVERWEAR_ADMIN_PWD=... y volvé a correr.")
            return

    print("\n--- 2. Catálogo ---")
    vends = medir("fetch_vendedores()", V.fetch_vendedores) or []
    vend = None
    for v in vends:
        if v.get("activo"):
            vend = int(v["codigo"])
            print(f"  vendedor ACTIVO de prueba: {v}")
            break
    if vend is None and vends:
        vend = int(vends[0]["codigo"])

    print("\n--- 3. Endpoints de la vista (forzar=True, sin cache) ---")
    top_cli = medir("top-clientes  (admin, 12 meses)",
                    lambda: V.fetch_top_clientes(None, forzar=True))
    top_lin = medir("top-lineas    (admin, 12 meses)",
                    lambda: V.fetch_top_lineas(None, forzar=True))
    if vend is not None:
        medir(f"top-clientes  (vendedor {vend})",
              lambda: V.fetch_top_clientes(vend, forzar=True))
        medir(f"top-lineas    (vendedor {vend})",
              lambda: V.fetch_top_lineas(vend, forzar=True))

    linea = None
    if isinstance(top_lin, dict):
        for clave in ("porUnidades", "porMonto"):
            lista = top_lin.get(clave) or []
            if lista:
                linea = lista[0].get("linea") or lista[0].get("nombre")
                break
    if linea:
        medir(f"clientes-por-linea ('{linea}')",
              lambda: V.fetch_clientes_por_linea(linea, None, forzar=True))

    cod = None
    if isinstance(top_cli, dict) and top_cli.get("porMonto"):
        cod = top_cli["porMonto"][0].get("numero")
    if cod:
        medir(f"ventas-por-linea (cliente {cod})",
              lambda: V.fetch_ventas_por_linea(int(cod), None))

    print("\n--- 4. Resumen (peor primero) ---")
    for etiqueta, dt in sorted(RESULTADOS, key=lambda x: -x[1]):
        print(f"  {dt:7.2f} s  {etiqueta:44} {'#' * min(60, int(dt * 10))}")
    print(f"\n  suma de todo: {sum(d for _, d in RESULTADOS):.2f} s")
    print("  (el navegador los pide en paralelo: manda el peor, no la suma)")
    print("\n" + "=" * 78)


if __name__ == "__main__":
    main()

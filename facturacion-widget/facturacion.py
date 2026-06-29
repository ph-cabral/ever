#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Calculadora de Facturacion - widget de escritorio para Windows.

Muestra, como una calculadora, la facturacion del dia leida en vivo de Magnus:
    ENTRA (codigo 11)  -  SALE (codigos 22, 23, 24, 25)  =  NETO
El numero grande es el NETO SIN IVA (21%). Abajo, el desglose.

Consulta http://10.10.0.159:3001/api/finanza/facturacion cada 30s.

  - Clic izquierdo  : abre http://10.10.0.159:3001/finanza
  - Arrastrar       : mover el widget por la pantalla (recuerda la posicion)
  - Clic derecho    : menu (Actualizar / Iniciar con Windows / Salir)

Empaquetar con build.bat (PyInstaller --onefile --noconsole) -> dist/Facturacion.exe
Ese .exe es autocontenido: se copia a cualquier PC Windows y corre sin instalar nada.

IMPORTANTE: la facturacion es informacion sensible, el endpoint pide login. Las
credenciales (usuario con modulo "finanza") van EMBEBIDAS en CONFIG, asi el .exe
es un solo archivo. Se pueden sobreescribir con credenciales.json o las variables
FACT_DNI / FACT_PASS. Ver README.md.
"""

import os
import sys
import json
import time
import threading
import webbrowser
import http.cookiejar
from urllib import request, error

# ----------------------------- CONFIG ---------------------------------------
API_BASE     = "http://10.10.0.159:3001"
API_URL      = API_BASE + "/api/finanza/facturacion"
FINANZA_URL  = API_BASE + "/finanza"
LOGIN_URL    = API_BASE + "/api/auth/login"
POLL_SECONDS = 30           # cada cuanto consulta la API
APP_NAME     = "FacturacionCalculadora"

# Credenciales del login automatico EMBEBIDAS: el .exe queda autocontenido
# (un solo archivo, sin credenciales.json al lado). Usuario con modulo "finanza".
# Se pueden sobreescribir por PC con FACT_DNI / FACT_PASS o credenciales.json
# (tienen prioridad sobre estas constantes).
LOGIN_DNI    = "35307009"
LOGIN_PASS   = "a35307009."

# Tamano del panel
PANEL_W, PANEL_H = 260, 188

# Paleta (estetica calculadora / LCD)
C_SHELL   = "#15181c"   # cuerpo de la calculadora
C_EDGE    = "#2b2f36"   # borde
C_LCD     = "#0c160c"   # pantalla
C_GREEN   = "#3ddc6f"   # neto (digitos LCD)
C_GREEN_D = "#1f7a3f"
C_TXT     = "#c9d1d9"   # texto general
C_MUTE    = "#7d8590"   # texto tenue
C_IN      = "#46d369"   # entra (+)
C_OUT     = "#ff6b6b"   # sale  (-)
C_TITLE   = "#9aa4af"
# ----------------------------------------------------------------------------

import tkinter as tk

# Estado compartido con el hilo que consulta la API
state = {
    "ok": False,          # ultima consulta exitosa
    "configurado": None,  # la tabla Magnus esta configurada en finanza.py
    "fecha": "",
    "entra": 0.0,
    "sale": 0.0,
    "neto_con_iva": 0.0,
    "neto_sin_iva": 0.0,
    "cantidad": 0,
    "msg": "",
    "ts": 0.0,            # epoch de la ultima consulta ok
}
stop_event = threading.Event()


# ------------------------- utilidades de entorno ----------------------------
def exe_path():
    if getattr(sys, "frozen", False):
        return sys.executable
    return os.path.abspath(__file__)


def config_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    d = os.path.join(base, APP_NAME)
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass
    return d


CONFIG_PATH = os.path.join(config_dir(), "config.json")
LOG_PATH = os.path.join(config_dir(), "facturacion.log")


def log(msg):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write("%s  %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg))
    except Exception:
        pass


def load_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f)
    except Exception:
        pass


def set_startup(enable):
    """Agrega/quita el widget del arranque de Windows (HKCU\\...\\Run)."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE)
        if enable:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, '"%s"' % exe_path())
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
        return True
    except Exception:
        return False


def enable_dpi_awareness():
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def fmt_money(x, con_signo=False):
    """Formato argentino: $ 1.234.567,89  (miles '.', decimales ',')."""
    if x is None:
        return "—"
    try:
        x = float(x)
    except (TypeError, ValueError):
        return "—"
    neg = x < 0
    s = "{:,.2f}".format(abs(x))            # 1,234,567.89
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    sign = "-" if neg else ("+" if con_signo else "")
    return "%s$ %s" % (sign, s)


# ------------------------------ polling -------------------------------------
# Mantiene la cookie de sesion (ever_session) entre requests.
_cookies = http.cookiejar.CookieJar()
_opener = request.build_opener(request.HTTPCookieProcessor(_cookies))


def load_credentials():
    """Prioridad: variables de entorno -> credenciales.json (junto al exe o en
    %APPDATA%) -> constantes LOGIN_DNI/LOGIN_PASS."""
    dni = os.environ.get("FACT_DNI", "").strip()
    pwd = os.environ.get("FACT_PASS", "")
    if dni and pwd:
        return dni, pwd
    for ruta in (os.path.join(os.path.dirname(exe_path()), "credenciales.json"),
                 os.path.join(config_dir(), "credenciales.json")):
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                d = json.load(f)
            if d.get("dni") and d.get("password"):
                return str(d["dni"]).strip(), str(d["password"])
        except Exception:
            pass
    return LOGIN_DNI, LOGIN_PASS


def do_login():
    dni, pwd = load_credentials()
    if not dni or not pwd:
        state["msg"] = "Sin credenciales"
        log("Sin credenciales: configura credenciales.json o FACT_DNI/FACT_PASS")
        return False
    payload = json.dumps({"dni": dni, "password": pwd}).encode("utf-8")
    req = request.Request(LOGIN_URL, data=payload,
                          headers={"Content-Type": "application/json",
                                   "User-Agent": APP_NAME})
    try:
        with _opener.open(req, timeout=6) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        if body.get("ok"):
            log("Login OK como %s" % body.get("usuario", {}).get("nombre", dni))
            return True
        state["msg"] = "Login rechazado"
        log("Login rechazado: %s" % body)
        return False
    except error.HTTPError as e:
        state["msg"] = "Login HTTP %s" % e.code
        log("Login HTTP %s: %s" % (e.code, e.reason))
        return False
    except Exception as e:
        state["msg"] = "Sin conexion"
        log("Login error: %s" % e)
        return False


def poll_once():
    """Una consulta. Devuelve True si trajo datos."""
    req = request.Request(API_URL, headers={"User-Agent": APP_NAME})
    with _opener.open(req, timeout=8) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    state["configurado"] = data.get("configurado", True)
    state["fecha"]        = data.get("fecha", "")
    state["entra"]        = float(data.get("entra", 0) or 0)
    state["sale"]         = float(data.get("sale", 0) or 0)
    state["neto_con_iva"] = float(data.get("neto_con_iva", 0) or 0)
    state["neto_sin_iva"] = float(data.get("neto_sin_iva", 0) or 0)
    state["cantidad"]     = int(data.get("cantidad", 0) or 0)
    state["ok"]           = True
    state["ts"]           = time.time()
    state["msg"]          = "" if state["configurado"] else "Pendiente config"
    return True


def poll_loop():
    logged = False
    last = None
    while not stop_event.is_set():
        try:
            if not logged:
                logged = do_login()
            poll_once()
            estado = ("ok", round(state["neto_sin_iva"], 2))
        except error.HTTPError as e:
            if e.code in (401, 403):
                logged = False        # cookie vencida o sin permiso -> re-login
            state["ok"] = False
            state["msg"] = "HTTP %s" % e.code
            estado = ("error", "HTTP %s" % e.code)
        except Exception as e:
            state["ok"] = False
            state["msg"] = "Sin conexion"
            estado = ("error", str(e))
        if estado != last:
            log("API %s -> %s" % estado)
            last = estado
        stop_event.wait(POLL_SECONDS)


def force_refresh():
    """Dispara una consulta ya (sin esperar el intervalo)."""
    def _r():
        try:
            poll_once()
        except Exception as e:
            state["ok"] = False
            log("refresh error: %s" % e)
    threading.Thread(target=_r, daemon=True).start()


# ------------------------------- widget -------------------------------------
class Calculadora:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(APP_NAME)
        self.root.overrideredirect(True)          # sin bordes ni barra de titulo
        self.root.attributes("-topmost", True)    # siempre adelante
        self.root.configure(bg=C_EDGE)

        self.cfg = load_config()
        if "startup" not in self.cfg:
            self.cfg["startup"] = True
            set_startup(True)
            save_config(self.cfg)
        else:
            set_startup(bool(self.cfg.get("startup")))

        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = int(self.cfg.get("x", sw - PANEL_W - 24))
        y = int(self.cfg.get("y", sh - PANEL_H - 60))
        self.root.geometry("%dx%d+%d+%d" % (PANEL_W, PANEL_H, x, y))

        self._build_ui()
        self._bind_all_drag(self.root)
        self.menu = self.build_menu()
        self._press = None
        self._moved = False

        self.refresh_ui()                          # primer pintado
        self.root.after(500, self._tick)           # refresco visual periodico

    # --------------------------------- UI -----------------------------------
    def _build_ui(self):
        # cuerpo de la "calculadora"
        body = tk.Frame(self.root, bg=C_SHELL, highlightbackground=C_EDGE,
                        highlightthickness=1)
        body.pack(fill="both", expand=True, padx=1, pady=1)
        self.body = body

        # encabezado
        head = tk.Frame(body, bg=C_SHELL)
        head.pack(fill="x", padx=10, pady=(8, 4))
        tk.Label(head, text="FACTURACIÓN", bg=C_SHELL, fg=C_TITLE,
                 font=("Segoe UI", 9, "bold")).pack(side="left")
        self.lbl_fecha = tk.Label(head, text="—", bg=C_SHELL, fg=C_MUTE,
                                  font=("Segoe UI", 8))
        self.lbl_fecha.pack(side="right")

        # pantalla LCD con el NETO
        lcd = tk.Frame(body, bg=C_LCD, highlightbackground=C_GREEN_D,
                       highlightthickness=1)
        lcd.pack(fill="x", padx=10, pady=2)
        self.lbl_neto = tk.Label(lcd, text="—", bg=C_LCD, fg=C_GREEN,
                                 font=("Consolas", 23, "bold"), anchor="e")
        self.lbl_neto.pack(fill="x", padx=8, pady=(6, 0))
        self.lbl_neto_sub = tk.Label(lcd, text="NETO · sin IVA 21%", bg=C_LCD,
                                     fg=C_GREEN_D, font=("Segoe UI", 8), anchor="e")
        self.lbl_neto_sub.pack(fill="x", padx=8, pady=(0, 5))

        # desglose
        row1 = tk.Frame(body, bg=C_SHELL); row1.pack(fill="x", padx=12, pady=(6, 0))
        tk.Label(row1, text="▲ Entra (11)", bg=C_SHELL, fg=C_MUTE,
                 font=("Segoe UI", 8)).pack(side="left")
        self.lbl_entra = tk.Label(row1, text="—", bg=C_SHELL, fg=C_IN,
                                  font=("Consolas", 9, "bold"))
        self.lbl_entra.pack(side="right")

        row2 = tk.Frame(body, bg=C_SHELL); row2.pack(fill="x", padx=12, pady=(1, 0))
        tk.Label(row2, text="▼ Sale (22-25)", bg=C_SHELL, fg=C_MUTE,
                 font=("Segoe UI", 8)).pack(side="left")
        self.lbl_sale = tk.Label(row2, text="—", bg=C_SHELL, fg=C_OUT,
                                 font=("Consolas", 9, "bold"))
        self.lbl_sale.pack(side="right")

        row3 = tk.Frame(body, bg=C_SHELL); row3.pack(fill="x", padx=12, pady=(1, 0))
        tk.Label(row3, text="= Con IVA", bg=C_SHELL, fg=C_MUTE,
                 font=("Segoe UI", 8)).pack(side="left")
        self.lbl_coniva = tk.Label(row3, text="—", bg=C_SHELL, fg=C_TXT,
                                   font=("Consolas", 9, "bold"))
        self.lbl_coniva.pack(side="right")

        # pie / estado
        foot = tk.Frame(body, bg=C_SHELL); foot.pack(fill="x", padx=12, pady=(6, 8))
        self.dot = tk.Label(foot, text="●", bg=C_SHELL, fg=C_MUTE,
                            font=("Segoe UI", 8))
        self.dot.pack(side="left")
        self.lbl_status = tk.Label(foot, text="conectando…", bg=C_SHELL, fg=C_MUTE,
                                   font=("Segoe UI", 8))
        self.lbl_status.pack(side="left", padx=(4, 0))

    def refresh_ui(self):
        if state["configurado"] is False:
            self.lbl_neto.config(text="—", fg=C_MUTE)
            self.lbl_neto_sub.config(text="pendiente de configurar tabla")
            for l in (self.lbl_entra, self.lbl_sale, self.lbl_coniva):
                l.config(text="—")
            self.lbl_fecha.config(text=state.get("fecha") or "")
            self.dot.config(fg="#e3b341")
            self.lbl_status.config(text="config. tabla Magnus")
            return

        self.lbl_neto.config(text=fmt_money(state["neto_sin_iva"]),
                             fg=C_GREEN if state["ok"] else C_MUTE)
        self.lbl_neto_sub.config(text="NETO · sin IVA 21%")
        self.lbl_entra.config(text=fmt_money(state["entra"]))
        self.lbl_sale.config(text=fmt_money(state["sale"]))
        self.lbl_coniva.config(text=fmt_money(state["neto_con_iva"]))
        self.lbl_fecha.config(text=state.get("fecha") or "")

        if state["ok"]:
            hhmm = time.strftime("%H:%M:%S", time.localtime(state["ts"]))
            cant = state["cantidad"]
            self.dot.config(fg=C_IN)
            self.lbl_status.config(text="%d comp. · %s" % (cant, hhmm))
        else:
            self.dot.config(fg=C_OUT)
            self.lbl_status.config(text=state.get("msg") or "sin conexión")

    def _tick(self):
        if stop_event.is_set():
            return
        self.refresh_ui()
        self.root.after(500, self._tick)

    # ------------------------- menu contextual ------------------------------
    def build_menu(self):
        m = tk.Menu(self.root, tearoff=0)
        m.add_command(label="Abrir finanzas",
                      command=lambda: webbrowser.open(FINANZA_URL))
        m.add_command(label="Actualizar ahora", command=force_refresh)
        self.startup_var = tk.BooleanVar(value=bool(self.cfg.get("startup", True)))
        m.add_checkbutton(label="Iniciar con Windows",
                          variable=self.startup_var, command=self.toggle_startup)
        m.add_separator()
        m.add_command(label="Salir", command=self.quit)
        return m

    def toggle_startup(self):
        val = bool(self.startup_var.get())
        set_startup(val)
        self.cfg["startup"] = val
        save_config(self.cfg)

    def on_menu(self, e):
        try:
            self.menu.tk_popup(e.x_root, e.y_root)
        finally:
            self.menu.grab_release()

    # ----------------------- arrastrar / clic -------------------------------
    def _bind_all_drag(self, w):
        w.bind("<ButtonPress-1>", self.on_press)
        w.bind("<B1-Motion>", self.on_drag)
        w.bind("<ButtonRelease-1>", self.on_release)
        w.bind("<ButtonPress-3>", self.on_menu)
        for c in w.winfo_children():
            self._bind_all_drag(c)

    def on_press(self, e):
        self._press = (e.x_root, e.y_root, self.root.winfo_x(), self.root.winfo_y())
        self._moved = False

    def on_drag(self, e):
        if not self._press:
            return
        dx = e.x_root - self._press[0]
        dy = e.y_root - self._press[1]
        if abs(dx) > 4 or abs(dy) > 4:
            self._moved = True
        self.root.geometry("+%d+%d" % (self._press[2] + dx, self._press[3] + dy))

    def on_release(self, e):
        if self._press and self._moved:
            self.cfg["x"] = self.root.winfo_x()
            self.cfg["y"] = self.root.winfo_y()
            save_config(self.cfg)
        elif self._press and not self._moved:
            webbrowser.open(FINANZA_URL)
        self._press = None

    def quit(self):
        stop_event.set()
        try:
            self.root.destroy()
        except Exception:
            pass


def main():
    log("===== Inicio. exe=%s =====" % exe_path())
    try:
        enable_dpi_awareness()
        threading.Thread(target=poll_loop, daemon=True).start()
        app = Calculadora()
        log("Ventana creada. Consultando %s" % API_URL)
        app.root.mainloop()
    except Exception:
        import traceback
        log("ERROR FATAL:\n" + traceback.format_exc())
        raise
    finally:
        stop_event.set()
        log("Fin.")


if __name__ == "__main__":
    main()

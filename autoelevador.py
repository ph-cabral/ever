#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Autoelevador Picking - widget de escritorio para Windows.

Muestra un autoelevador animado SOLO cuando hay pedidos pendientes en /picking.
Consulta http://10.10.0.159:3001/api/picking/estado y cuando "pendientes" > 0
aparece el autoelevador moviendose 50px de derecha a izquierda y acercandose /
alejandose (zoom). Cuando la tabla queda vacia (pendientes == 0) desaparece.

  - Clic izquierdo  : abre http://10.10.0.159:3001/picking
  - Arrastrar       : mover el widget por la pantalla (recuerda la posicion)
  - Clic derecho    : menu (Abrir picking / Iniciar con Windows / Salir)

Empaquetar con build.bat (PyInstaller --onefile --noconsole) -> dist/Autoelevador.exe
Ese .exe es autocontenido: se copia a cualquier PC Windows y corre sin instalar nada.
"""

import os
import sys
import json
import math
import time
import threading
import webbrowser
from urllib import request

# ----------------------------- CONFIG ---------------------------------------
API_URL      = "http://10.10.0.159:3001/api/picking/estado"
PICKING_URL  = "http://10.10.0.159:3001/picking"
POLL_SECONDS = 5            # cada cuanto consulta la API
APP_NAME     = "AutoelevadorPicking"

TRANSPARENT  = "#ff00ff"    # color "magenta" que se vuelve transparente (no usar en el dibujo)
CANVAS_W, CANVAS_H = 260, 210
CX, CY       = 130, 112     # centro del autoelevador dentro del canvas
FPS          = 25           # cuadros por segundo de la animacion
MOVE_PX      = 25           # amplitud horizontal -> 50px pico a pico
ZOOM         = 0.16         # amplitud de acercar/alejar
PERIOD       = 2.6          # segundos por ciclo de animacion

# colores del dibujo
C_BODY   = "#F39200"; C_BODY_DK = "#D67E00"; C_DARK = "#33373b"
C_MAST   = "#5a5f63"; C_MAST_HL = "#7a8084"; C_FORK = "#9aa0a4"
C_TIRE   = "#1b1b1b"; C_HUB     = "#cccccc"
C_BOX    = "#c79a5b"; C_BOX_DK  = "#a87f43"; C_PALLET = "#8a6a3e"
C_BADGE  = "#e23b2e"; C_OUTLINE = "#222222"
# ----------------------------------------------------------------------------

import tkinter as tk

# Estado compartido con el hilo que consulta la API
pendientes = 0
api_ok = False
stop_event = threading.Event()


# ------------------------- utilidades de entorno ----------------------------
def exe_path():
    """Ruta del ejecutable (cuando esta empaquetado) o del script."""
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
    """Evita el dibujo borroso en pantallas con escalado."""
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


# ------------------------------ polling -------------------------------------
def poll_loop():
    global pendientes, api_ok
    while not stop_event.is_set():
        try:
            req = request.Request(API_URL, headers={"User-Agent": APP_NAME})
            with request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                pendientes = int(data.get("pendientes", 0) or 0)
                api_ok = True
        except Exception:
            pendientes = 0
            api_ok = False
        stop_event.wait(POLL_SECONDS)


# ------------------------------- widget -------------------------------------
class Forklift:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(APP_NAME)
        self.root.overrideredirect(True)          # sin bordes ni barra de titulo
        self.root.attributes("-topmost", True)    # siempre adelante
        self.root.configure(bg=TRANSPARENT)
        try:
            self.root.attributes("-transparentcolor", TRANSPARENT)  # fondo transparente
        except Exception:
            pass

        self.cfg = load_config()
        # Primera ejecucion: por defecto se registra para iniciar con Windows.
        if "startup" not in self.cfg:
            self.cfg["startup"] = True
            set_startup(True)
            save_config(self.cfg)
        else:
            set_startup(bool(self.cfg.get("startup")))

        # Posicion inicial (abajo a la derecha por defecto).
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = int(self.cfg.get("x", sw - CANVAS_W - 24))
        y = int(self.cfg.get("y", sh - CANVAS_H - 60))
        self.root.geometry("%dx%d+%d+%d" % (CANVAS_W, CANVAS_H, x, y))

        self.canvas = tk.Canvas(self.root, width=CANVAS_W, height=CANVAS_H,
                                bg=TRANSPARENT, highlightthickness=0, bd=0)
        self.canvas.pack()

        # Eventos de mouse
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<ButtonPress-3>", self.on_menu)
        self._press = None
        self._moved = False

        self.menu = self.build_menu()
        self.t0 = time.time()
        self.root.after(0, self.animate)

    # ------------------------- menu contextual ------------------------------
    def build_menu(self):
        m = tk.Menu(self.root, tearoff=0)
        m.add_command(label="Abrir picking",
                      command=lambda: webbrowser.open(PICKING_URL))
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
            webbrowser.open(PICKING_URL)
        self._press = None

    def quit(self):
        stop_event.set()
        try:
            self.root.destroy()
        except Exception:
            pass

    # ------------------------------ animacion -------------------------------
    def animate(self):
        if not stop_event.is_set():
            self.canvas.delete("fork")
            if pendientes > 0:
                t = time.time() - self.t0
                ph = (t / PERIOD) * 2 * math.pi
                xoff = math.sin(ph) * MOVE_PX          # 50px der-izq
                s = 1.0 + ZOOM * math.sin(ph)          # acercar / alejar
                yoff = math.sin(ph * 2) * 4            # leve cabeceo
                lift = math.sin(ph * 1.5) * 3          # leve sube/baja de la carga
                self.draw_forklift(s, xoff, yoff, lift, pendientes)
            self.root.after(int(1000 / FPS), self.animate)

    # transforma una coordenada local a la pantalla
    def P(self, x, y, s, xoff, yoff):
        return (CX + x * s + xoff, CY + y * s + yoff)

    def rect(self, x0, y0, x1, y1, s, xoff, yoff, **kw):
        a = self.P(x0, y0, s, xoff, yoff)
        b = self.P(x1, y1, s, xoff, yoff)
        self.canvas.create_rectangle(a[0], a[1], b[0], b[1], tags="fork", **kw)

    def oval(self, cx, cy, r, s, xoff, yoff, **kw):
        a = self.P(cx - r, cy - r, s, xoff, yoff)
        b = self.P(cx + r, cy + r, s, xoff, yoff)
        self.canvas.create_oval(a[0], a[1], b[0], b[1], tags="fork", **kw)

    def draw_forklift(self, s, xoff, yoff, lift, count):
        """Autoelevador visto de costado, mirando a la izquierda (forks a la izq)."""
        def R(x0, y0, x1, y1, **kw):
            self.rect(x0, y0, x1, y1, s, xoff, yoff, **kw)

        def O(cx, cy, r, **kw):
            self.oval(cx, cy, r, s, xoff, yoff, **kw)

        def POLY(pts, **kw):
            flat = []
            for (px, py) in pts:
                X, Y = self.P(px, py, s, xoff, yoff)
                flat += [X, Y]
            self.canvas.create_polygon(*flat, tags="fork", **kw)

        # ruedas (atras del cuerpo)
        O(2, 38, 12, fill=C_TIRE, outline=C_OUTLINE)
        O(40, 38, 13, fill=C_TIRE, outline=C_OUTLINE)
        O(2, 38, 4, fill=C_HUB, outline="")
        O(40, 38, 5, fill=C_HUB, outline="")

        # contrapeso / cuerpo
        R(8, -6, 52, 30, fill=C_BODY, outline=C_OUTLINE)
        R(8, 18, 52, 30, fill=C_BODY_DK, outline="")          # sombra inferior
        POLY([(8, -6), (30, -6), (24, 6), (8, 6)], fill=C_BODY_DK, outline=C_OUTLINE)  # capot

        # techo de seguridad (overhead guard)
        R(10, -58, 15, -6, fill=C_DARK, outline="")           # parante delantero
        R(45, -58, 50, -6, fill=C_DARK, outline="")           # parante trasero
        R(6, -64, 52, -56, fill=C_DARK, outline="")           # techo

        # mastil
        R(-2, -58, 6, 36, fill=C_MAST, outline=C_OUTLINE)
        R(0, -54, 4, 34, fill=C_MAST_HL, outline="")

        # carro + uñas (forks) con leve elevacion "lift"
        R(-6, 4 + lift, 0, 34 + lift, fill=C_MAST, outline=C_OUTLINE)
        R(-46, 30 + lift, -4, 35 + lift, fill=C_FORK, outline=C_OUTLINE)
        POLY([(-46, 30 + lift), (-50, 30 + lift), (-50, 35 + lift), (-46, 35 + lift)],
             fill=C_FORK, outline=C_OUTLINE)

        # carga: pallet + caja apoyada en las uñas
        R(-44, 24 + lift, -8, 30 + lift, fill=C_PALLET, outline=C_OUTLINE)
        R(-42, 2 + lift, -10, 24 + lift, fill=C_BOX, outline=C_OUTLINE)
        R(-42, 2 + lift, -10, 8 + lift, fill=C_BOX_DK, outline="")

        # badge con la cantidad de pendientes
        O(50, -58, 12, fill=C_BADGE, outline="white", width=2)
        bx, by = self.P(50, -58, s, xoff, yoff)
        self.canvas.create_text(bx, by, text=str(count), fill="white",
                                font=("Segoe UI", max(8, int(11 * s)), "bold"),
                                tags="fork")


def main():
    enable_dpi_awareness()
    threading.Thread(target=poll_loop, daemon=True).start()
    app = Forklift()
    try:
        app.root.mainloop()
    finally:
        stop_event.set()


if __name__ == "__main__":
    main()

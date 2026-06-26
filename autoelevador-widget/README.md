# Autoelevador Picking — widget de escritorio

Mini aplicación para Windows que muestra un **autoelevador animado** en la
pantalla **solo cuando hay pedidos pendientes en `/picking`**. El autoelevador se
mueve ~50px de derecha a izquierda y se acerca/aleja (zoom). Cuando la tabla queda
vacía (se asigna *con existencia* / *sin existencia* a cada artículo), desaparece.

## Cómo funciona

- Consulta `http://10.10.0.159:3001/api/picking/estado` cada 5 segundos.
- Si la respuesta trae `pendientes > 0` → aparece y se anima.
- Si `pendientes == 0` o el servidor no responde → se oculta (queda invisible y no molesta).

## Controles

| Acción | Resultado |
|---|---|
| **Clic izquierdo** sobre el autoelevador | Abre `http://10.10.0.159:3001/picking` en el navegador |
| **Arrastrar** (mantener y mover) | Lo movés a cualquier parte de la pantalla (recuerda la posición) |
| **Clic derecho** | Menú: *Abrir picking* / *Iniciar con Windows* / *Salir* |

> Nota: como el fondo es transparente, solo el autoelevador recibe clics. Para
> arrastrarlo, agarralo del dibujo.

## Generar el .exe (una sola vez)

En una PC con **Python 3** instalado:

1. Doble clic en **`build.bat`** (o ejecutar desde una consola).
2. Espera a que compile. Queda en **`dist\Autoelevador.exe`**.

Ese `.exe` es **autocontenido** (incluye Python y todo lo necesario):
se copia a **cualquier PC Windows** y se ejecuta **sin instalar nada más**.

## Iniciar con Windows

- En la **primera ejecución** se registra solo para arrancar al iniciar sesión
  (clave `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).
- Para activarlo/desactivarlo cuando quieras: **clic derecho → Iniciar con Windows**.

## Configuración

Si necesitás cambiar la URL, el puerto, el tamaño o la velocidad, editá las
constantes al inicio de `autoelevador.py` (sección `CONFIG`) y volvé a compilar:

```python
API_URL      = "http://10.10.0.159:3001/api/picking/estado"
PICKING_URL  = "http://10.10.0.159:3001/picking"
POLL_SECONDS = 5
MOVE_PX      = 25     # amplitud horizontal (50px pico a pico)
ZOOM         = 0.16   # cuanto se acerca/aleja
PERIOD       = 2.6    # segundos por ciclo
```

La posición en pantalla y la preferencia de autostart se guardan en
`%APPDATA%\AutoelevadorPicking\config.json`.

## Archivos

- `autoelevador.py` — código del widget.
- `build.bat` — compila el `.exe` con PyInstaller.
- `README.md` — este archivo.

# Calculadora de Facturación — widget de escritorio

Mini aplicación para Windows que muestra, **como una calculadora**, la
**facturación del día** leída en vivo de Magnus:

```
ENTRA (código 11)  −  SALE (códigos 22, 23, 24, 25)  =  NETO
```

El número grande (LCD verde) es el **NETO sin IVA (21%)**. Abajo, el desglose:
lo que entra (cód. 11), lo que sale (notas 22-25) y el total **con IVA**.

## Cómo funciona

- Hace login automático y consulta `http://10.10.0.159:3001/api/finanza/facturacion` cada 30 s.
- Muestra el neto del día y el desglose. Si el servidor no responde, queda el
  último valor con un punto rojo y "sin conexión".
- Si todavía no se configuró la tabla de Magnus en el backend, muestra
  "pendiente de configurar tabla" (ver sección siguiente).

## ⚠️ Antes de que muestre números: configurar la fuente en Magnus

La facturación sale de una tabla de Magnus que **falta confirmar**. Para
encontrarla:

1. Correr `indicadores-api/descubrir_facturacion.sql` en SSMS, **o** abrir
   `http://10.10.0.159:3001/api/finanza/descubrir` (devuelve tablas candidatas).
2. Completar el bloque `CONFIG` de `indicadores-api/finanza.py` con la tabla y
   las columnas reales (código, importe, fecha; opcional neto).
3. Reiniciar `indicadores-api`. Listo: el widget empieza a mostrar el neto.

## Credenciales (login del widget)

La facturación es sensible, así que el endpoint pide sesión. Usar un usuario
**con permiso del módulo «finanza»**. Tres formas (de mayor a menor prioridad):

1. Variables de entorno `FACT_DNI` y `FACT_PASS`.
2. `credenciales.json` al lado del `.exe` (copiar de `credenciales.example.json`).
3. Constantes `LOGIN_DNI` / `LOGIN_PASS` en `facturacion.py` (no recomendado).

## Controles

| Acción | Resultado |
|---|---|
| **Clic izquierdo** sobre el panel | Abre `http://10.10.0.159:3001/finanza` |
| **Arrastrar** | Lo movés por la pantalla (recuerda la posición) |
| **Clic derecho** | Menú: *Abrir finanzas* / *Actualizar ahora* / *Iniciar con Windows* / *Salir* |

## Generar el .exe (una sola vez)

En una PC con **Python 3** instalado:

1. Doble clic en **`build.bat`** (o ejecutar desde una consola).
2. Queda en **`dist\Facturacion.exe`** (autocontenido, no instala nada).
3. Copiar el `.exe` **y** `credenciales.json` a la PC destino.

## Iniciar con Windows

- En la **primera ejecución** se registra solo para arrancar al iniciar sesión.
- Activar/desactivar: **clic derecho → Iniciar con Windows**.

## Configuración

Editá las constantes del inicio de `facturacion.py` (sección `CONFIG`) y volvé
a compilar:

```python
API_BASE     = "http://10.10.0.159:3001"
POLL_SECONDS = 30        # cada cuánto consulta
```

La posición en pantalla y el autostart se guardan en
`%APPDATA%\FacturacionCalculadora\config.json`. El log queda en
`%APPDATA%\FacturacionCalculadora\facturacion.log`.

## Archivos

- `facturacion.py` — código del widget.
- `build.bat` — compila el `.exe` con PyInstaller.
- `credenciales.example.json` — plantilla de credenciales.
- `README.md` — este archivo.

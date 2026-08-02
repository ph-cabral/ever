"""
Genera un GOOGLE_REFRESH_TOKEN nuevo, dedicado a Google Calendar, para el
.env de `ever` (lib/rrhh/googleCalendar.ts) — el error 403
"insufficientPermissions" en /rrhh/asistencia pasa porque el refresh_token
que se puso ahí (reusando el de vicki_mail) sólo fue autorizado con los
scopes de Gmail/Drive, no con los de Calendar.

Este script pide un token NUEVO, sólo con los scopes de Calendar. Usa el
MISMO Client ID/Secret OAuth que ya usa n8n/vicki_mail (no hace falta crear
una app nueva en Google Cloud Console) pero NO toca ni reemplaza el
refresh_token que ya usa vicki_mail para Gmail/Drive — genera uno aparte,
sólo para pegar en ever/.env.

Requisitos previos en Google Cloud Console (mismo proyecto que ya usa n8n):

  1. APIs & Services > Library > buscar "Google Calendar API" > Enable
     (si todavía no estaba habilitada para el proyecto).
  2. APIs & Services > OAuth consent screen > (pestaña "Data access" o
     "Scopes") > "Add or remove scopes" > agregar:
       https://www.googleapis.com/auth/calendar.events
       https://www.googleapis.com/auth/calendar.readonly
     y guardar.
  3. APIs & Services > Credentials > abrir el Client ID que ya usa n8n:
     - Si es tipo "Desktop app": no hace falta tocar nada más.
     - Si es tipo "Web application": agregar `http://localhost:8765/` a
       "Authorized redirect URIs" (si no, este script falla con
       redirect_uri_mismatch).

Uso:
    pip install google-auth-oauthlib
    GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... python get_calendar_refresh_token.py

Se abre el navegador -> loguearse con la cuenta de Google que va a "ser
dueña" del evento (seleccion@everwear.com.ar, la misma que usa vicki_mail,
salvo que se decida usar otra) -> aceptar los permisos de Calendar -> el
script imprime GOOGLE_REFRESH_TOKEN=... para pegar en ever/.env (junto con
los mismos GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET usados acá).

Importante: la cuenta con la que se loguea acá es la que necesita tener
permiso "Hacer cambios en los eventos" sobre el/los calendario(s) que se
van a usar desde /rrhh/asistencia (compartir el calendario con esa cuenta
desde Google Calendar > Configuración de ese calendario > Compartir).
"""
import os
import sys

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    sys.exit("Falta la librería: pip install google-auth-oauthlib")

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]

client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()

if not client_id or not client_secret:
    sys.exit(
        "Faltan variables de entorno.\n"
        "Uso: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... python get_calendar_refresh_token.py"
    )

client_config = {
    "installed": {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost"],
    }
}

flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
# access_type=offline -> pide refresh_token. prompt=consent -> fuerza que lo
# vuelva a emitir aunque esta cuenta ya haya autorizado antes esta app (si
# no, Google a veces omite el refresh_token en re-autorizaciones).
creds = flow.run_local_server(port=8765, prompt="consent", access_type="offline")

print()
print("Listo. Pegá esto en ever/.env (junto con el mismo CLIENT_ID/SECRET usados arriba):")
print()
print(f"GOOGLE_CLIENT_ID={client_id}")
print(f"GOOGLE_CLIENT_SECRET={client_secret}")
print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")

#!/usr/bin/env bash
#
# krb5-renew.sh — Renueva el ticket Kerberos que usa indicadores-api para
# autenticarse contra SQL Server (Trusted_Connection / integrated auth).
#
# Obtiene un TGT NUEVO desde un keytab (no depende del renew_lifetime, no se
# muere despues de N dias) y lo escribe en el ccache que el contenedor monta
# read-only: /opt/krb5cc/cc  (== KRB5_CCNAME del docker-compose).
#
# La publicacion es ATOMICA: kinit escribe a un temporal en el mismo
# directorio y luego se hace `mv` (rename) sobre el ccache, asi el contenedor
# nunca lee un ccache a medio escribir. Como en el compose se monta el
# DIRECTORIO /opt/krb5cc (no el archivo), el contenedor ve el ticket nuevo en
# la siguiente conexion sin reiniciar y sin inode stale.
#
set -euo pipefail

# --- Configuracion (se puede pisar por Environment= en el .service) ----------
KEYTAB="${KEYTAB:-/etc/krb5-renew/svc.keytab}"  # keytab del usuario de servicio (FUERA del mount del contenedor)
CCACHE="${CCACHE:-/opt/krb5cc/cc}"              # debe coincidir con KRB5_CCNAME del compose
PRINCIPAL="${PRINCIPAL:-}"                       # vacio = autodetectar la 1ra entrada del keytab
LIFETIME="${LIFETIME:-10h}"                      # vida pedida; AD la limita a su politica
# -----------------------------------------------------------------------------

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S%z')] $*"; }
die() { log "ERROR: $*"; exit 1; }

command -v kinit >/dev/null || die "kinit no encontrado (instala krb5-user en el host)"
[[ -r "$KEYTAB" ]] || die "no se puede leer el keytab '$KEYTAB'"

# Autodetectar el principal (primera entrada que tenga @REALM) si no se fijo.
if [[ -z "$PRINCIPAL" ]]; then
  PRINCIPAL="$(klist -k "$KEYTAB" 2>/dev/null | awk 'NF>=2 && $2 ~ /@/ {print $2; exit}')"
fi
[[ -n "$PRINCIPAL" ]] || die "no se pudo determinar el principal; defini PRINCIPAL"

ccdir="$(dirname "$CCACHE")"
[[ -d "$ccdir" ]] || die "el directorio del ccache '$ccdir' no existe"

tmpcc="$(mktemp "${ccdir}/.cc.XXXXXX")"
trap 'rm -f "$tmpcc"' EXIT

log "kinit $PRINCIPAL (keytab=$KEYTAB, lifetime=$LIFETIME)"
kinit -k -t "$KEYTAB" -l "$LIFETIME" -c "FILE:$tmpcc" "$PRINCIPAL" \
  || die "kinit fallo (revisa principal, enctype/salt/kvno del keytab y conectividad al KDC)"

# Verificar que el ticket realmente sirve antes de publicarlo.
KRB5CCNAME="FILE:$tmpcc" klist >/dev/null || die "el ticket recien obtenido no valida"

chmod 600 "$tmpcc"
mv -f "$tmpcc" "$CCACHE"     # rename atomico dentro del mismo filesystem
trap - EXIT

log "OK -> ticket publicado en $CCACHE"
KRB5CCNAME="FILE:$CCACHE" klist | sed 's/^/    /'

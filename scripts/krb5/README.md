# Renovación automática del ticket Kerberos (indicadores-api → SQL Server)

`indicadores-api` se conecta a SQL Server con autenticación integrada
(`Trusted_Connection=yes` en `db.py`). No usa usuario/clave: usa un **ticket
Kerberos** que vive en un *credential cache* en el host (`/opt/krb5cc/cc`) y
que el contenedor monta read-only. Cuando ese ticket vence, la API deja de
conectar. Estos archivos lo renuevan solo.

## Cómo funciona

Un **keytab** del usuario de servicio guarda sus credenciales, así que podemos
pedir un ticket nuevo cuando queramos sin intervención humana y sin depender
del `renew_lifetime` (que vence a los ~7 días). Un **timer de systemd** corre
`krb5-renew.sh` cada 6 horas; el script hace `kinit` desde el keytab y publica
el ticket en `/opt/krb5cc/cc` de forma atómica. El contenedor lo ve en la
siguiente conexión, sin reiniciar.

```
keytab (/etc/krb5-renew/svc.keytab)
        │  kinit -k -t ... -c FILE:tmp
        ▼
  /opt/krb5cc/.cc.XXXX  ──mv (atómico)──►  /opt/krb5cc/cc  ──(mount ro)──►  contenedor
```

## Prerrequisitos (en el host)

- Cliente Kerberos: `apt-get install krb5-user` (provee `kinit`/`klist`).
- `/etc/krb5.conf` configurado con el realm `EVERWEAR.LOCAL` y el/los KDC
  (los DC: 10.10.0.232 / 10.10.0.254). Ya debe estar, porque hoy se genera
  `/opt/krb5cc/cc` a mano.
- El directorio `/opt/krb5cc` existe y es donde el compose monta el ccache.

## 1. Generar el keytab del usuario de servicio

Elegí **una** opción. Reemplazá `svcsql` por el usuario de servicio real y
`EVERWEAR.LOCAL` por el realm en MAYÚSCULAS.

**Opción A — Windows (controlador de dominio), `ktpass`.** ⚠️ `ktpass` con
`-pass` **resetea la contraseña** de la cuenta; usá una cuenta de servicio
dedicada y coordiná el cambio.

```cmd
ktpass -out svcsql.keytab -princ svcsql@EVERWEAR.LOCAL ^
       -mapuser EVERWEAR\svcsql -pass * ^
       -crypto AES256-SHA1 -ptype KRB5_NT_PRINCIPAL
```

Copiá `svcsql.keytab` al host Linux.

**Opción B — Linux, `ktutil` desde la contraseña conocida** (no cambia la
clave). El enctype debe coincidir con AD (normalmente AES256):

```bash
ktutil <<'EOF'
addent -password -p svcsql@EVERWEAR.LOCAL -k 1 -e aes256-cts-hmac-sha1-96
wkt /etc/krb5-renew/svc.keytab
quit
EOF
```

Probalo: `kinit -k -t /etc/krb5-renew/svc.keytab svcsql@EVERWEAR.LOCAL`. Si da
"Preauthentication failed", el problema suele ser el **salt** o el **kvno**;
ahí conviene la Opción A o C.

**Opción C — Linux unido al dominio, `msktutil`** (lo más prolijo: crea la
cuenta y **rota la clave/keytab solo**):

```bash
msktutil --create --service host --keytab /etc/krb5-renew/svc.keytab \
         --computer-name INDICADORES-API --upn svcsql@EVERWEAR.LOCAL
```

### Asegurá el keytab (es un secreto)

```bash
sudo mkdir -p /etc/krb5-renew
sudo mv svcsql.keytab /etc/krb5-renew/svc.keytab
sudo chown root:root /etc/krb5-renew/svc.keytab
sudo chmod 600 /etc/krb5-renew/svc.keytab
```

> Se guarda en `/etc/krb5-renew/`, **fuera** de `/opt/krb5cc`, para que el
> keytab NO quede expuesto dentro del contenedor (que sí monta `/opt/krb5cc`).

## 2. Instalar el script

```bash
sudo install -m 0755 scripts/krb5/krb5-renew.sh /usr/local/bin/krb5-renew.sh
```

Probalo a mano y verificá el ticket:

```bash
sudo /usr/local/bin/krb5-renew.sh
sudo KRB5CCNAME=FILE:/opt/krb5cc/cc klist     # debe mostrar el TGT y su vencimiento
```

## 3. Instalar el timer de systemd

```bash
sudo cp scripts/krb5/krb5-renew.service /etc/systemd/system/
sudo cp scripts/krb5/krb5-renew.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now krb5-renew.timer
```

## 4. Verificar

```bash
systemctl list-timers krb5-renew.timer      # próxima corrida
journalctl -u krb5-renew.service -n 20      # resultado de la última
sudo KRB5CCNAME=FILE:/opt/krb5cc/cc klist   # vencimiento del ticket actual

# El contenedor lo ve igual (tiene krb5-user instalado):
docker exec -e KRB5CCNAME=FILE:/opt/krb5cc/cc indicadores_api klist
```

## Notas

- **Frecuencia.** El intervalo del timer debe ser MENOR que la vida del ticket
  de AD. Default acá: cada 6h para un ticket de ~10h. Si tu política de dominio
  da tickets más cortos, bajá el `OnCalendar`.
- **No depende de `-R`.** Al sacar un ticket fresco del keytab, no importa el
  `renew_lifetime` ni cuánto estuvo apagada la máquina.
- **Rollback.** Es todo nuevo y versionado:
  `git rm -r scripts/krb5` y en el host
  `sudo systemctl disable --now krb5-renew.timer` +
  `sudo rm /etc/systemd/system/krb5-renew.{service,timer} /usr/local/bin/krb5-renew.sh`.

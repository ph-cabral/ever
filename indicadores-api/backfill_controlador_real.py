"""
Backfill puntual (2026-07-21): completa "nroControladorReal"/"nombreControladorReal"
en deposito.errores_mesa para los registros cargados ANTES de que insert_error_mesa /
insert_error_calidad empezaran a resolver ese dato contra Magnus (ver errores_mesa.py,
CAMBIO 2026-07-21). Sin esto, la columna "Controlador" de la vista /deposito queda
vacía ("—") para todo lo cargado antes del deploy.

Corre 1 sola vez, del lado del server (indicadores-api — tiene acceso a Magnus y a
Postgres). Idempotente: solo toca filas con "nombreControladorReal" IS NULL, así que
se puede volver a correr sin problema (ej. si quedó algún pedido sin control todavía
en Magnus al momento de correrlo).

Uso (parado en indicadores-api/, con el mismo entorno/.env que usa la API):
    python backfill_controlador_real.py --dry-run   # solo muestra, no escribe
    python backfill_controlador_real.py              # aplica los cambios
"""
import argparse

from db_pg import get_pg_connection
from errores_mesa import fetch_controlador_pedido


def main(dry_run: bool) -> None:
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            'SELECT id, "nroPedido" FROM deposito.errores_mesa '
            'WHERE "nombreControladorReal" IS NULL ORDER BY id'
        )
        pendientes = cur.fetchall()
    finally:
        conn.close()

    print(f"{len(pendientes)} registro(s) sin controlador real.")
    if dry_run:
        print("(--dry-run: no se escribe nada en Postgres)\n")

    cache: dict[int, dict | None] = {}
    actualizados = 0
    sin_control = 0

    for error_id, nro_pedido in pendientes:
        if nro_pedido not in cache:
            cache[nro_pedido] = fetch_controlador_pedido(nro_pedido)
        ctrl = cache[nro_pedido]

        if not ctrl:
            sin_control += 1
            print(f"  id={error_id} pedido={nro_pedido}: sin control registrado en Magnus")
            continue

        print(f"  id={error_id} pedido={nro_pedido}: {ctrl['nombreControlador']}")
        if dry_run:
            continue

        upd = get_pg_connection()
        try:
            ucur = upd.cursor()
            ucur.execute(
                'UPDATE deposito.errores_mesa '
                'SET "nroControladorReal" = %s, "nombreControladorReal" = %s '
                "WHERE id = %s",
                (ctrl["nroControlador"], ctrl["nombreControlador"], error_id),
            )
            upd.commit()
        finally:
            upd.close()
        actualizados += 1

    print(f"\nListo. Actualizados: {actualizados}. Sin control en Magnus: {sin_control}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar, no escribir en Postgres")
    args = parser.parse_args()
    main(args.dry_run)

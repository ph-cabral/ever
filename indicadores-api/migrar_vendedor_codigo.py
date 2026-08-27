"""
Migración one-shot: usuario.vendedorCodigo de `Ped_Usu_Arma` a `Vendedores`.

Contexto (2026-08-27): hasta hoy `usuario.vendedorCodigo` (Postgres,
everwear.usuario) guardaba códigos del maestro `Ped_Usu_Arma`, que resultó
ser el equivocado — ver cartera.py. Los códigos de los dos maestros se pisan
(mismo rango, personas distintas), así que un código viejo NO se puede
reinterpretar: hay que traducirlo POR NOMBRE.

Qué hace:
  1. Lee los dos maestros de Magnus.
  2. Lee los usuarios con vendedorCodigo asignado.
  3. Para cada uno: código viejo → nombre en Ped_Usu_Arma → mismo nombre en
     Vendedores → código nuevo.
  4. Imprime la tabla de traducción y el UPDATE de Postgres.

NO escribe nada por sí solo: con --aplicar ejecuta los UPDATE, sin eso solo
muestra qué haría. Correr siempre primero sin --aplicar y leer la salida.

    docker compose exec indicadores-api python migrar_vendedor_codigo.py
    docker compose exec indicadores-api python migrar_vendedor_codigo.py --aplicar

Los nombres se comparan normalizados (mayúsculas, sin acentos, sin el
prefijo "(baja)", y con las palabras ORDENADAS): en un maestro está
"Blanco Julio" y en el otro "BLANCO JULIO", y ordenar las palabras hace que
den lo mismo sin tener que adivinar cuál es el apellido.
"""
import sys
import unicodedata

from db import get_connection
from db_pg import get_pg_connection


def normalizar(nombre: str | None) -> str:
    if not nombre:
        return ""
    t = unicodedata.normalize("NFD", str(nombre))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").upper()
    t = t.replace("(BAJA)", " ").replace(".", " ").replace(",", " ")
    return " ".join(sorted(p for p in t.split() if p))


def leer_maestros():
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(
            "SELECT Usu_Arma_Codigo, Usu_Arma_Nombre FROM MAGNUS_SITD.dbo.Ped_Usu_Arma"
        )
        viejo = {int(c): (n or "").strip() for c, n in cur.fetchall() if c is not None}
        cur.execute(
            "SELECT VendedorCodigo, VendedorNombre, Estado_Desc FROM MAGNUS_SITD.dbo.Vendedores"
        )
        nuevo = {}
        for c, n, e in cur.fetchall():
            if c is None:
                continue
            nuevo[int(c)] = ((n or "").strip(), (e or "").strip())
        return viejo, nuevo
    finally:
        conn.close()


def main(aplicar: bool) -> int:
    viejo, nuevo = leer_maestros()
    # nombre normalizado → código nuevo (si un nombre está repetido en
    # Vendedores nos quedamos con el habilitado)
    por_nombre: dict[str, int] = {}
    for cod, (nom, estado) in nuevo.items():
        k = normalizar(nom)
        if not k:
            continue
        if k not in por_nombre or estado.upper().startswith("HABILITADO"):
            por_nombre[k] = cod

    pg = get_pg_connection()
    try:
        cur = pg.cursor()
        cur.execute(
            'SELECT id, nombre, "vendedorCodigo" FROM everwear.usuario '
            'WHERE "vendedorCodigo" IS NOT NULL ORDER BY id'
        )
        usuarios = cur.fetchall()
        if not usuarios:
            print("No hay usuarios con vendedorCodigo asignado — nada que migrar.")
            return 0

        print(f"{'usuario':<28} {'viejo':>6}  {'nombre (Ped_Usu_Arma)':<32} {'nuevo':>6}  nombre (Vendedores)")
        print("-" * 120)
        cambios: list[tuple[int, int]] = []
        sin_match: list[str] = []
        for uid, unombre, cod_viejo in usuarios:
            nom_viejo = viejo.get(int(cod_viejo), "")
            cod_nuevo = por_nombre.get(normalizar(nom_viejo))
            nom_nuevo = nuevo.get(cod_nuevo, ("", ""))[0] if cod_nuevo else ""
            print(
                f"{(unombre or '')[:28]:<28} {cod_viejo:>6}  {nom_viejo[:32]:<32} "
                f"{(cod_nuevo if cod_nuevo else '—'):>6}  {nom_nuevo}"
            )
            if cod_nuevo is None:
                sin_match.append(f"{unombre} (código viejo {cod_viejo}, nombre '{nom_viejo}')")
            elif cod_nuevo != int(cod_viejo):
                cambios.append((uid, cod_nuevo))

        print()
        if sin_match:
            print("SIN TRADUCCIÓN — hay que reasignarlos a mano en /admin/usuarios:")
            for x in sin_match:
                print("  ·", x)
            print()

        if not cambios:
            print("Ningún código cambia.")
            return 0

        print("UPDATE a aplicar:")
        for uid, cod in cambios:
            print(f'  UPDATE everwear.usuario SET "vendedorCodigo" = {cod} WHERE id = {uid};')

        if not aplicar:
            print("\n(simulación — volvé a correr con --aplicar para ejecutarlo)")
            return 0

        for uid, cod in cambios:
            cur.execute(
                'UPDATE everwear.usuario SET "vendedorCodigo" = %s WHERE id = %s',
                (cod, uid),
            )
        pg.commit()
        print(f"\nListo: {len(cambios)} usuario(s) actualizado(s).")
        return 0
    finally:
        pg.close()


if __name__ == "__main__":
    sys.exit(main("--aplicar" in sys.argv))

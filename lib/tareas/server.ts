// Motor de API compartido por los tableros de tareas de RRHH y Calidad.
// Cada área (RRHH, Calidad) tiene sus propias 3 tablas Prisma (columna,
// tarjeta, config) — ver sql/rrhh_tareas.sql, sql/calidad_tareas.sql y el
// bloque "tareas" de prisma/schema.prisma. Estas funciones son agnósticas del
// área: reciben los nombres de esos 3 modelos y operan siempre sobre ESA
// terna, nunca las mezclan entre sí ni con sistema_*. Así el motor (drag&drop,
// columnas, config de orden) se escribe una sola vez y cada área queda con
// datos completamente separados.
//
// Los route.ts de app/api/rrhh/tareas/** y app/api/calidad/tarea/** son
// wrappers finitos que solo fijan la terna de modelos y delegan acá.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type TableroModels = {
  columna: "rrhh_tarea_columna" | "calidad_tarea_columna";
  tarjeta: "rrhh_tarea_tarjeta" | "calidad_tarea_tarjeta";
  config: "rrhh_tarea_config" | "calidad_tarea_config";
};

// Los 3 modelos difieren por área pero comparten exactamente la misma forma
// (ver schema.prisma) — acceder por nombre dinámico es más simple acá que
// duplicar este archivo entero por área; de ahí el `any` acotado a este único
// punto de entrada al cliente de Prisma.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function delegate(name: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any)[name];
}

const CRITERIOS = ["POSICION", "CREACION", "IMPORTANCIA"];

async function getOrCreateConfig(models: TableroModels) {
  return delegate(models.config).upsert({
    where: { clave: "default" },
    update: {},
    create: { clave: "default" },
  });
}

// GET /api/<area>/<tareas> — tablero completo: columnas con sus tarjetas + config.
export async function GET_tablero(models: TableroModels) {
  try {
    const [columnas, tarjetas, config] = await Promise.all([
      delegate(models.columna).findMany({ orderBy: { orden: "asc" } }),
      delegate(models.tarjeta).findMany({ orderBy: { orden: "asc" } }),
      getOrCreateConfig(models),
    ]);
    const result = columnas.map((c: { id: number }) => ({
      ...c,
      tarjetas: tarjetas.filter((t: { columnaId: number }) => t.columnaId === c.id),
    }));
    return NextResponse.json({ columnas: result, config });
  } catch (error) {
    console.error("GET tablero tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// GET /api/<area>/<tareas>/config
export async function GET_config(models: TableroModels) {
  try {
    return NextResponse.json(await getOrCreateConfig(models));
  } catch (error) {
    console.error("GET config tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH /api/<area>/<tareas>/config  body: { criterioOrden }
export async function PATCH_config(models: TableroModels, req: NextRequest) {
  try {
    const { criterioOrden } = await req.json();
    if (!CRITERIOS.includes(criterioOrden)) {
      return NextResponse.json({ error: "criterioOrden inválido" }, { status: 400 });
    }
    const config = await delegate(models.config).upsert({
      where: { clave: "default" },
      update: { criterioOrden },
      create: { clave: "default", criterioOrden },
    });
    return NextResponse.json(config);
  } catch (error) {
    console.error("PATCH config tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/<area>/<tareas>/columnas  body: { nombre }
export async function POST_columna(models: TableroModels, req: NextRequest) {
  try {
    const { nombre } = await req.json();
    if (!nombre?.trim()) return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    const max = await delegate(models.columna).aggregate({ _max: { orden: true } });
    const col = await delegate(models.columna).create({
      data: { nombre: nombre.trim(), orden: (max._max.orden ?? -1) + 1 },
    });
    return NextResponse.json(col, { status: 201 });
  } catch (error) {
    console.error("POST columna tareas", error);
    return NextResponse.json({ error: "Error interno (¿nombre repetido?)" }, { status: 500 });
  }
}

// PATCH /api/<area>/<tareas>/columnas/[id]  body: { nombre } — renombrar
export async function PATCH_columna(models: TableroModels, req: NextRequest, id: number) {
  try {
    const { nombre } = await req.json();
    if (!nombre?.trim()) return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    const col = await delegate(models.columna).update({
      where: { id },
      data: { nombre: nombre.trim() },
    });
    return NextResponse.json(col);
  } catch (error) {
    console.error("PATCH columna tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE /api/<area>/<tareas>/columnas/[id] — reasigna tarjetas a otra columna
// del mismo tablero (la primera por orden, distinta de la borrada). Si no
// queda ninguna otra, se rechaza (mismo criterio que /api/sistema/columnas/[id]).
export async function DELETE_columna(models: TableroModels, id: number) {
  try {
    const columna = await delegate(models.columna).findUnique({ where: { id } });
    if (!columna) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const otras = await delegate(models.columna).findMany({
      where: { id: { not: id } },
      orderBy: { orden: "asc" },
    });
    const enColumna = await delegate(models.tarjeta).count({ where: { columnaId: id } });

    if (enColumna > 0 && otras.length === 0) {
      return NextResponse.json(
        { error: "No se puede borrar la única columna mientras tenga tarjetas" },
        { status: 400 },
      );
    }
    if (enColumna > 0) {
      const destino = otras[0];
      const max = await delegate(models.tarjeta).aggregate({
        where: { columnaId: destino.id },
        _max: { orden: true },
      });
      let orden = (max._max.orden ?? -1) + 1;
      const tarjetas = await delegate(models.tarjeta).findMany({
        where: { columnaId: id },
        orderBy: { orden: "asc" },
      });
      for (const t of tarjetas) {
        await delegate(models.tarjeta).update({
          where: { id: t.id },
          data: { columnaId: destino.id, orden: orden++ },
        });
      }
    }
    await delegate(models.columna).delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE columna tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH /api/<area>/<tareas>/columnas/reorder  body: { orden: number[] }
export async function PATCH_columnas_reorder(models: TableroModels, req: NextRequest) {
  try {
    const { orden } = await req.json();
    if (!Array.isArray(orden) || orden.some((x) => typeof x !== "number")) {
      return NextResponse.json({ error: "orden debe ser number[]" }, { status: 400 });
    }
    await prisma.$transaction(
      orden.map((id: number, idx: number) =>
        delegate(models.columna).update({ where: { id }, data: { orden: idx } }),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH columnas/reorder tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/<area>/<tareas>/tarjetas  body: { columnaId, campos }
export async function POST_tarjeta(models: TableroModels, req: NextRequest) {
  try {
    const { columnaId, campos } = await req.json();
    if (!columnaId) return NextResponse.json({ error: "Falta columnaId" }, { status: 400 });
    const max = await delegate(models.tarjeta).aggregate({
      where: { columnaId: Number(columnaId) },
      _max: { orden: true },
    });
    const tarjeta = await delegate(models.tarjeta).create({
      data: {
        columnaId: Number(columnaId),
        orden: (max._max.orden ?? -1) + 1,
        campos: campos ?? {},
      },
    });
    return NextResponse.json(tarjeta, { status: 201 });
  } catch (error) {
    console.error("POST tarjeta tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH /api/<area>/<tareas>/tarjetas/[id]  body: { campos?, columnaId?, orden? }
export async function PATCH_tarjeta(models: TableroModels, req: NextRequest, id: number) {
  try {
    const body = await req.json();
    const { campos, columnaId, orden } = body;
    const data: Record<string, unknown> = {};
    if (columnaId !== undefined) {
      const nuevaColumnaId = Number(columnaId);
      data.columnaId = nuevaColumnaId;
      const actual = await delegate(models.tarjeta).findUnique({
        where: { id },
        select: { columnaId: true },
      });
      if (actual && actual.columnaId !== nuevaColumnaId) data.columnaDesde = new Date();
    }
    if (campos !== undefined) data.campos = campos;
    if (orden !== undefined) data.orden = Number(orden);
    const tarjeta = await delegate(models.tarjeta).update({ where: { id }, data });
    return NextResponse.json(tarjeta);
  } catch (error) {
    console.error("PATCH tarjeta tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE /api/<area>/<tareas>/tarjetas/[id]
export async function DELETE_tarjeta(models: TableroModels, id: number) {
  try {
    await delegate(models.tarjeta).delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE tarjeta tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH /api/<area>/<tareas>/tarjetas/reorder
// body: { cambios: [{ id, columnaId, orden }, ...] }
// Usado tanto para el drag&drop en orden manual (recalcula `orden` de toda la
// columna origen/destino) como para un simple cambio de columna cuando el
// criterio de orden es CREACION/IMPORTANCIA (un solo cambio, `orden` no se
// usa para mostrar pero se guarda igual por si después se vuelve a POSICION).
export async function PATCH_tarjetas_reorder(models: TableroModels, req: NextRequest) {
  try {
    const { cambios } = await req.json();
    if (!Array.isArray(cambios) || cambios.length === 0) {
      return NextResponse.json({ error: "cambios debe ser un array no vacío" }, { status: 400 });
    }
    for (const c of cambios) {
      if (typeof c.id !== "number" || typeof c.columnaId !== "number" || typeof c.orden !== "number") {
        return NextResponse.json(
          { error: "cada cambio requiere id, columnaId, orden (number)" },
          { status: 400 },
        );
      }
    }
    const cambiosTipados = cambios as { id: number; columnaId: number; orden: number }[];
    const actuales = await delegate(models.tarjeta).findMany({
      where: { id: { in: cambiosTipados.map((c) => c.id) } },
      select: { id: true, columnaId: true },
    });
    const actualPorId = new Map(
      actuales.map((t: { id: number; columnaId: number }) => [t.id, t]),
    );
    const ahora = new Date();
    await prisma.$transaction(
      cambiosTipados.map((c) => {
        const actual = actualPorId.get(c.id);
        const cambioColumna = actual?.columnaId !== c.columnaId;
        const data: Record<string, unknown> = { columnaId: c.columnaId, orden: c.orden };
        if (cambioColumna) data.columnaDesde = ahora;
        return delegate(models.tarjeta).update({ where: { id: c.id }, data });
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH tarjetas/reorder tareas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

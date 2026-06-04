"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getPersonalAction() {
  return prisma.personal.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
}

export async function getManguerasAction() {
  return prisma.manguera.findMany({ orderBy: { createdAt: "desc" } });
}

export async function addMangueraAction(formData: FormData) {
  const codigo = (formData.get("codigo") as string).toUpperCase().trim();
  const metros = parseFloat(formData.get("metros") as string);
  const ubicacion = (formData.get("ubicacion") as string).toUpperCase().trim();
  if (!codigo || isNaN(metros) || metros <= 0)
    throw new Error("Datos inválidos");
  await prisma.manguera.create({
    data: { codigo, metros, ubicacion: ubicacion || null },
  });
  revalidatePath("/manguera");
}

export async function cortarMangueraAction(
  id: number,
  metrosUsados: number,
  personalId: number,
) {
  if (!id || isNaN(metrosUsados) || !personalId)
    throw new Error("Datos inválidos");
  const rollo = await prisma.manguera.findUnique({ where: { id } });
  if (!rollo) throw new Error("Rollo no encontrado");
  const persona = await prisma.personal.findUnique({
    where: { id: personalId },
  });
  if (!persona) throw new Error("Personal no encontrado");
  const cortado = Math.abs(metrosUsados);
  if (cortado > rollo.metros) throw new Error("No hay suficientes metros");
  const nuevosMetros = rollo.metros - cortado;
  await prisma.corte.create({
    data: { codigo: rollo.codigo, metros: cortado, personalId: persona.id },
  });
  if (nuevosMetros <= 0) await prisma.manguera.delete({ where: { id } });
  else
    await prisma.manguera.update({
      where: { id },
      data: { metros: nuevosMetros },
    });
  revalidatePath("/manguera");
}

export async function addPersonalAction(formData: FormData) {
  const nombre = (formData.get("nombre") as string).toUpperCase().trim();
  const dni = (formData.get("dni") as string)?.trim() || null;
  if (!nombre) throw new Error("El nombre es obligatorio");
  await prisma.personal.create({ data: { nombre, dni } });
  revalidatePath("/manguera");
}

/* ---------- TRABAJOS ---------- */

export async function getLegajosMangueraAction() {
  return prisma.legajo.findMany({
    where: {
      sectorRel: {
        is: { nombre: { equals: "mangueras", mode: "insensitive" } },
      },
    },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, sectorRel: { select: { nombre: true } } },
  });
}

export async function getClienteAction(numero: number) {
  if (numero == null || isNaN(numero)) return null;
  return prisma.cliente.findUnique({
    where: { numero },
    select: { numero: true, nombre: true },
  });
}

export async function getTrabajosAction() {
  return prisma.trabajo.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ordenTrabajo: true,
      fechaPedido: true,
      producto: true,
      estado: true,
      legajo: { select: { nombre: true } },
      sector: { select: { nombre: true } },
      cliente: { select: { nombre: true } },
      _count: { select: { cortes: true } },
    },
  });
}

type NuevoCorte = {
  mangueraId: number;
  codigo: string;
  metros: number;
  observacion?: string | null;
};
type NuevoTrabajoInput = {
  legajoId: number;
  clienteNumero: number | null;
  ordenTrabajo?: string | null;
  prioridad?: string | null;
  producto?: string | null;
  cantidadAProducir?: number | null;
  observaciones?: string | null;
  inicio: string;
  cortes: NuevoCorte[];
};

function calcEstado(cantidad: number | null | undefined, nCortes: number) {
  if (!cantidad || cantidad <= 0)
    return nCortes > 0 ? "TERMINADO" : "PENDIENTE";
  if (nCortes === cantidad) return "CUMPLIDO";
  return nCortes < cantidad ? "INCOMPLETO" : "EXCEDIDO";
}

export async function createTrabajoAction(input: NuevoTrabajoInput) {
  if (!input.legajoId) throw new Error("Elegí un operario");
  if (!input.cortes?.length) throw new Error("Agregá al menos un corte");

  const legajo = await prisma.legajo.findUnique({
    where: { id: input.legajoId },
    select: { id: true, sectorId: true },
  });
  if (!legajo) throw new Error("Operario no encontrado");

  let clienteNumero: number | null = null;
  if (input.clienteNumero != null && !isNaN(input.clienteNumero)) {
    const cli = await prisma.cliente.findUnique({
      where: { numero: input.clienteNumero },
    });
    if (!cli) throw new Error(`Cliente ${input.clienteNumero} no existe`);
    clienteNumero = cli.numero;
  }

  const estado = calcEstado(input.cantidadAProducir, input.cortes.length);

  await prisma.$transaction(async (tx) => {
    const trabajo = await tx.trabajo.create({
      data: {
        legajoId: legajo.id,
        sectorId: legajo.sectorId,
        clienteNumero,
        ordenTrabajo: input.ordenTrabajo?.trim() || null,
        prioridad: input.prioridad || null,
        producto: input.producto?.trim() || null,
        cantidadAProducir: input.cantidadAProducir ?? null,
        observaciones: input.observaciones?.trim() || null,
        estado,
        inicio: new Date(input.inicio),
        fin: new Date(),
      },
    });

    for (const c of input.cortes) {
      const rollo = await tx.manguera.findUnique({
        where: { id: c.mangueraId },
      });
      if (!rollo) throw new Error(`Manguera ${c.codigo} no encontrada`);
      const usar = Math.max(0, c.metros || 0);
      await tx.corte.create({
        data: {
          codigo: c.codigo,
          metros: usar,
          observacion: c.observacion?.trim() || null,
          trabajoId: trabajo.id,
        },
      });
      const resto = rollo.metros - usar;
      if (resto <= 0) await tx.manguera.delete({ where: { id: rollo.id } });
      else
        await tx.manguera.update({
          where: { id: rollo.id },
          data: { metros: resto },
        });
    }
  });

  revalidatePath("/manguera");
}

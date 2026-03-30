"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getPersonalAction() {
  return await prisma.personal.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
}

export async function getManguerasAction() {
  return await prisma.manguera.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function addMangueraAction(formData: FormData) {
  const codigo = (formData.get("codigo") as string).toUpperCase().trim();
  const metros = parseFloat(formData.get("metros") as string);
  const ubicacion = (formData.get("ubicacion") as string).toUpperCase().trim();

  if (!codigo || isNaN(metros) || metros <= 0) {
    throw new Error("Datos inválidos");
  }

  await prisma.manguera.create({
    data: { codigo, metros, ubicacion: ubicacion || null },
  });

  revalidatePath("/");
}

export async function cortarMangueraAction(
  id: number,
  metrosUsados: number,
  personalId: number,
) {
  if (!id || isNaN(metrosUsados) || !personalId) {
    throw new Error("Datos inválidos");
  }

  const rollo = await prisma.manguera.findUnique({ where: { id } });
  if (!rollo) throw new Error("Rollo no encontrado");

  const persona = await prisma.personal.findUnique({ where: { id: personalId } });
  if (!persona) throw new Error("Personal no encontrado");

  const cortado = Math.abs(metrosUsados);
  if (cortado > rollo.metros) throw new Error("No hay suficientes metros");

  const nuevosMetros = rollo.metros - cortado;

  await prisma.corte.create({
    data: {
      codigo: rollo.codigo,
      metros: cortado,
      personalId: persona.id,
    },
  });

  if (nuevosMetros <= 0) {
    await prisma.manguera.delete({ where: { id } });
  } else {
    await prisma.manguera.update({
      where: { id },
      data: { metros: nuevosMetros },
    });
  }

  revalidatePath("/");
}

export async function addPersonalAction(formData: FormData) {
  const nombre = (formData.get("nombre") as string).toUpperCase().trim();
  const dni = (formData.get("dni") as string)?.trim() || null;

  if (!nombre) throw new Error("El nombre es obligatorio");

  await prisma.personal.create({ data: { nombre, dni } });
  revalidatePath("/");
}

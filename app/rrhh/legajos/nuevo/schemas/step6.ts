import { z } from "zod";

export const equipoSchema = z.object({
  tipo: z.enum([
    "notebook",
    "desktop",
    "monitor",
    "celular",
    "tablet",
    "impresora",
    "perifericos",
    "otro",
  ]),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  detalle: z.string().optional(), // specs adicionales
  numeroSerie: z.string().optional(),
  fechaEntrega: z.string().optional(),
  estado: z.enum(["nuevo", "usado"]),
  observaciones: z.string().optional(),
});

export const step6Schema = z.object({
  equipos: z.array(equipoSchema).default([]),
  aceptaClausulas: z
    .boolean()
    .refine((v) => v === true, {
      message: "Debe aceptar las cláusulas de uso y devolución",
    }),
  jurisdiccion: z.string().default("San Francisco, Córdoba"),
  firmaEmpleado: z.string().optional(), // path/URL imagen firma o nombre escrito
  fechaFirma: z.string().optional(),
});

export type Step6Data = z.infer<typeof step6Schema>;
export type Equipo = z.infer<typeof equipoSchema>;

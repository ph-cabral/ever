import { z } from "zod";

export const step2Schema = z.object({
  calle: z.string().min(1, "Requerido"),
  numero: z.string().min(1, "Requerido"),
  piso: z.string().optional(),
  depto: z.string().optional(),
  codigoPostal: z.string().regex(/^\d{4,8}$/, "CP inválido"),
  localidad: z.string().min(1, "Requerido"),
  provincia: z.string().min(1, "Requerido").default("Córdoba"),
  comprobanteUrl: z.string().optional(), // path/URL al archivo subido
  ddjjConformidad: z
    .boolean()
    .refine((v) => v === true, { message: "Debe firmar la DDJJ" }),
});

export type Step2Data = z.infer<typeof step2Schema>;

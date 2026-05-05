import { z } from "zod";

export const familiarSchema = z.object({
  parentesco: z.enum([
    "padre", "madre", "hermano", "conyuge", "pareja", "hijo", "otro",
  ]),
  apellido: z.string().min(1, "Requerido"),
  nombre: z.string().min(1, "Requerido"),
  tipoDocumento: z.enum(["DNI", "LE", "LC", "PAS", "CI"]).default("DNI"),
  numeroDocumento: z.string().min(1, "Requerido"),
  fechaNacimiento: z.string().min(1, "Requerido"),
  nacionalidad: z.string().min(1, "Requerido").default("Argentina"),
  telefono: z.string().optional(),
  ocupacion: z.string().optional(),
  convive: z.boolean().default(false),
});

export const beneficiarioSchema = z.object({
  apellidoNombre: z.string().min(1, "Requerido"),
  tipoDocumento: z.enum(["DNI", "LE", "LC", "PAS", "CI"]).default("DNI"),
  numeroDocumento: z.string().min(1, "Requerido"),
  parentesco: z.string().min(1, "Requerido"),
  domicilio: z.string().min(1, "Requerido"),
  porcentaje: z
    .number({ invalid_type_error: "Numérico" })
    .min(0.01, "Mayor a 0")
    .max(100, "Máximo 100"),
});

export const step4Schema = z
  .object({
    estadoCivil: z.string(), // heredado del paso 1, sólo se muestra
    tieneCargasFamilia: z.boolean().default(false),
    medioPagoAaff: z.enum(["cuenta_sueldo", "otro"]).default("cuenta_sueldo"),
    medioPagoAaffOtro: z.string().optional(),
    familiares: z.array(familiarSchema).default([]),
    beneficiarios: z
      .array(beneficiarioSchema)
      .min(1, "Debe cargar al menos un beneficiario"),
  })
  .refine(
    (d) => {
      const total = d.beneficiarios.reduce((s, b) => s + (b.porcentaje || 0), 0);
      return Math.abs(total - 100) < 0.01;
    },
    {
      message: "La suma de porcentajes debe ser exactamente 100%",
      path: ["beneficiarios"],
    }
  );

export type Step4Data = z.infer<typeof step4Schema>;
export type Familiar = z.infer<typeof familiarSchema>;
export type Beneficiario = z.infer<typeof beneficiarioSchema>;

import { z } from "zod";

export const step3Schema = z.object({
  fechaInicio: z.string().min(1, "Requerido"),
  fechaCese: z.string().optional(),

  modalidadContrato: z.string().min(1, "Requerido"), // ej "014 - Nuevo período de prueba"
  situacionRevista: z.string().min(1, "Requerido").default("01"),
  regimen: z.string().min(1, "Requerido").default("SIPA"),

  convenio: z.string().min(1, "Requerido"), // ej "0130/75 - Comercio"
  categoria: z.string().min(1, "Requerido"), // ej "007604 - Categoría B Adm."
  puestoInterno: z.string().min(1, "Requerido"),
  sector: z.string().min(1, "Requerido"),

  retribucionPactada: z
    .number({ invalid_type_error: "Numérico" })
    .min(0, "No puede ser negativa"),
  modalidadLiquidacion: z.enum(["mes", "quincena", "dia"]),

  obraSocial: z.string().min(1, "Requerido"), // ej "126205 - OSECAC"
  tipoServicio: z.string().optional(),
  actividadEconomica: z.string().optional(),
  domicilioExplotacion: z.string().optional(),

  claveAltaArca: z.string().regex(/^CA\w+$/i, "Debe iniciar con CA").optional().or(z.literal("")),
  fechaEnvioAlta: z.string().optional(),

  banco: z.enum(["bbva", "nacion", "galicia", "otro"]),
  bancoOtro: z.string().optional(),
  diaPago: z
    .number({ invalid_type_error: "Numérico" })
    .min(1).max(31).optional(),

  percibeSeguroDesempleo: z.boolean().default(false),
  ddjjArt12: z
    .boolean()
    .refine((v) => v === true, { message: "Debe firmar la DDJJ Art. 12" }),
}).refine(
  (d) => d.banco !== "otro" || (d.bancoOtro && d.bancoOtro.length > 0),
  { message: "Indicar nombre del banco", path: ["bancoOtro"] }
);

export type Step3Data = z.infer<typeof step3Schema>;

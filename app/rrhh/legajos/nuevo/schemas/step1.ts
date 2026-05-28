import { z } from "zod";

export const estudioSchema = z.object({
  nivel: z.enum(["primaria", "secundaria", "terciario", "universitario", "otro"]),
  institucion: z.string().optional(),
  desde: z.string().optional(), // YYYY-MM o YYYY
  hasta: z.string().optional(),
  titulo: z.string().optional(),
  enCurso: z.boolean().default(false),
});

export const idiomaSchema = z.object({
  idioma: z.string().optional(),
  habla: z.enum(["basico", "intermedio", "avanzado", "nativo"]),
  escritura: z.enum(["basico", "intermedio", "avanzado", "nativo"]),
});

export const step1Schema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  dni: z
    .string()
    .regex(/^\d{7,8}$/, "DNI inválido")
    .optional()
    .or(z.literal("")),
  cuil: z
    .string()
    .regex(/^\d{2}-\d{7,8}-\d$/, "Formato CUIL")
    .optional()
    .or(z.literal("")),
  fechaNacimiento: z.string().optional(),
  lugarNacimiento: z.string().optional(),
  nacionalidad: z.string().optional().default("Argentina"),
  sexo: z.enum(["M", "F", "X"]),
  estadoCivil: z.enum([
    "soltero",
    "casado",
    "concubinato",
    "divorciado",
    "viudo",
    "separado",
  ]),
  altura: z
    .number({ invalid_type_error: "Numérico" })
    .min(0.5)
    .max(2.5)
    .optional(),
  peso: z
    .number({ invalid_type_error: "Numérico" })
    .min(20)
    .max(250)
    .optional(),
  manoHabil: z.enum(["derecha", "izquierda", "ambidiestro"]),
  telefonoFijo: z.string().optional(),
  telefonoCelular: z.string().optional(),
  emailPersonal: z.string().email("Email inválido"),
  estudios: z.array(estudioSchema).default([]),
  idiomas: z.array(idiomaSchema).default([]),
  antecedentesPenales: z.boolean().default(false),
  antecedentesDetalle: z.string().optional(),
  aceptaPsicotecnico: z.boolean().default(false),
});


export type Step1Data = z.infer<typeof step1Schema>;
export type Estudio = z.infer<typeof estudioSchema>;
export type Idioma = z.infer<typeof idiomaSchema>;

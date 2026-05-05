import { z } from "zod";

export const estudioSchema = z.object({
  nivel: z.enum(["primaria", "secundaria", "terciario", "universitario", "otro"]),
  institucion: z.string().min(1, "Requerido"),
  desde: z.string().min(1, "Requerido"), // YYYY-MM o YYYY
  hasta: z.string().optional(),
  titulo: z.string().optional(),
  enCurso: z.boolean().default(false),
});

export const idiomaSchema = z.object({
  idioma: z.string().min(1, "Requerido"),
  habla: z.enum(["basico", "intermedio", "avanzado", "nativo"]),
  escritura: z.enum(["basico", "intermedio", "avanzado", "nativo"]),
});

export const step1Schema = z.object({
  apellido: z.string().min(1, "Requerido").max(100),
  nombre: z.string().min(1, "Requerido").max(100),
  dni: z
    .string()
    .regex(/^\d{7,8}$/, "DNI inválido (7 u 8 dígitos)"),
  cuil: z
    .string()
    .regex(/^\d{2}-\d{7,8}-\d$/, "Formato CUIL: XX-XXXXXXXX-X"),
  fechaNacimiento: z.string().min(1, "Requerido"),
  lugarNacimiento: z.string().min(1, "Requerido"),
  nacionalidad: z.string().min(1, "Requerido").default("Argentina"),
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
  telefonoCelular: z.string().min(1, "Requerido"),
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

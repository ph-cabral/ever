import { z } from "zod";

// Update parcial de legajo (RRHH). Solo columnas escalares.
// Claves desconocidas (id, codigo, relaciones, createdAt…) se descartan solas.
const str  = z.string().trim().max(300).optional().nullable();
const bool = z.boolean().optional();
const num  = z.coerce.number().optional().nullable();
const int  = z.coerce.number().int().optional().nullable();
const date = z.coerce.date().optional().nullable();

export const legajoUpdateSchema = z.object({
  estado: z.string().max(20).optional(),
  // step1
  nombre: z.string().trim().min(1).max(100).optional(),
  dni: str, cuil: str, fechaNacimiento: date, lugarNacimiento: str,
  nacionalidad: str, sexo: z.string().max(2).optional(), estadoCivil: str,
  altura: num, peso: num, manoHabil: str,
  telefonoFijo: str, telefonoCelular: str,
  emailPersonal: z.string().trim().max(150).optional().nullable(),
  antecedentesPenales: bool, antecedentesDetalle: str, aceptaPsicotecnico: bool,
  // step2
  calle: str, numero: str, piso: str, depto: str, codigoPostal: str,
  localidad: str, provincia: str, comprobanteUrl: str, ddjjConformidad: bool,
  // step3
  fechaInicio: date, fechaCese: date, modalidadContrato: str, situacionRevista: str,
  regimen: str, convenio: str, categoria: str, puestoInterno: str, sector: str,
  retribucionPactada: num, modalidadLiquidacion: str, obraSocial: str,
  tipoServicio: str, actividadEconomica: str, domicilioExplotacion: str,
  claveAltaArca: str, fechaEnvioAlta: date, banco: str, bancoOtro: str,
  diaPago: int, percibeSeguroDesempleo: bool, ddjjArt12: bool, sectorId: int,
  // step4
  tieneCargasFamilia: bool, medioPagoAaff: str, medioPagoAaffOtro: str,
  // step5
  estatura: num, pesoSalud: num, presionMin: int, presionMax: int,
  patologiaNervioso: bool, patologiaRespiratorio: bool, patologiaCirculatorio: bool,
  patologiaDigestivo: bool, patologiaRenal: bool, patologiaOseo: bool,
  patologiaSangre: bool, patologiaCancer: bool, patologiaCongenitas: bool,
  patologiaEndocrinas: bool, patologiaGinecologicas: bool, patologiaEmbarazo: bool,
  patologiaOtras: bool, patologiaChagas: bool, observacionesSalud: str,
  numeroSolicitud: str, numeroPoliza: str, capitalAsegurado: num,
  fechaIngresoEmpleo: date, artCompania: str, artNumeroContrato: str,
  artCredencialEntregada: bool,
  // step6
  aceptaClausulas: bool, jurisdiccion: z.string().max(100).optional(),
  firmaEmpleado: str, fechaFirma: date,
}); // sin .strict(): descarta claves extra (id/codigo/relaciones)

export type LegajoUpdate = z.infer<typeof legajoUpdateSchema>;

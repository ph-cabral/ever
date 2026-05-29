"use client";

import { useEffect, useRef } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, Plus } from "lucide-react";

import {
  step1Schema,
  type Step1Data,
} from "@/app/rrhh/legajos/nuevo/schemas/step1";
import { calcularCuil } from "@/lib/rrhh/cuil";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Step1Props {
  defaultValues?: Partial<Step1Data>;
  onSubmit: (data: Step1Data) => void;
  onSaveDraft?: (data: Partial<Step1Data>) => void;
}

export function Step1Personales({
  defaultValues,
  onSubmit,
  onSaveDraft,
}: Step1Props) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      nacionalidad: "Argentina",
      manoHabil: "derecha",
      antecedentesPenales: false,
      aceptaPsicotecnico: false,
      estudios: [],
      idiomas: [],
      ...defaultValues,
    },
  });

  const estudios = useFieldArray({ control, name: "estudios" });
  const idiomas = useFieldArray({ control, name: "idiomas" });
  // Autocálculo CUIL
  const dni = watch("dni");
  const sexo = watch("sexo");
  const antecedentes = watch("antecedentesPenales");

  useEffect(() => {
    if (dni && sexo) {
      const cuil = calcularCuil(dni, sexo);
      if (cuil) setValue("cuil", cuil, { shouldValidate: true });
    }
  }, [dni, sexo, setValue]);

const allValues = watch();
const prevRef = useRef<string>("");
useEffect(() => {
  const serialized = JSON.stringify(allValues);
  if (isDirty && serialized !== prevRef.current) {
    prevRef.current = serialized;
    onSaveDraft?.(allValues);
  }
});

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* ===== IDENTIDAD ===== */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">Identidad</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nombre" error={errors.nombre?.message} required>
            <Input {...register("nombre")} />
          </Field>
          <Field label="Sexo" error={errors.sexo?.message} required>
            <Controller
              name="sexo"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Femenino</SelectItem>
                    <SelectItem value="X">X</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="DNI" error={errors.dni?.message}>
            <Input
              {...register("dni")}
              inputMode="numeric"
              placeholder="12345678"
              maxLength={8}
            />
          </Field>
          <Field label="CUIL (autocalculado)" error={errors.cuil?.message}>
            <Input {...register("cuil")} placeholder="XX-XXXXXXXX-X" />
          </Field>
          <Field
            label="Fecha de nacimiento"
            error={errors.fechaNacimiento?.message}
          >
            <Controller
              control={control}
              name="fechaNacimiento"
              render={({ field }) => (
                <DateField
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Field
            label="Lugar de nacimiento"
            error={errors.lugarNacimiento?.message}
          >
            <Input
              {...register("lugarNacimiento")}
              placeholder="San Francisco, Córdoba"
            />
          </Field>
          <Field label="Nacionalidad" error={errors.nacionalidad?.message}>
            <Input {...register("nacionalidad")} />
          </Field>
          <Field label="Estado civil" error={errors.estadoCivil?.message}>
            <Controller
              name="estadoCivil"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soltero">Soltero/a</SelectItem>
                    <SelectItem value="casado">Casado/a</SelectItem>
                    <SelectItem value="concubinato">Concubinato</SelectItem>
                    <SelectItem value="divorciado">Divorciado/a</SelectItem>
                    <SelectItem value="separado">Separado/a</SelectItem>
                    <SelectItem value="viudo">Viudo/a</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Mano hábil" error={errors.manoHabil?.message}>
            <Controller
              name="manoHabil"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="derecha">Derecha</SelectItem>
                    <SelectItem value="izquierda">Izquierda</SelectItem>
                    <SelectItem value="ambidiestro">Ambidiestro</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Altura (m)" error={errors.altura?.message}>
            <Input
              type="number"
              step="0.01"
              {...register("altura", { valueAsNumber: true })}
              placeholder="1.75"
            />
          </Field>
          <Field label="Peso (kg)" error={errors.peso?.message}>
            <Input
              type="number"
              step="0.1"
              {...register("peso", { valueAsNumber: true })}
              placeholder="75"
            />
          </Field>
        </div>
      </section>

      {/* ===== CONTACTO ===== */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">Contacto</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Teléfono fijo" error={errors.telefonoFijo?.message}>
            <Input {...register("telefonoFijo")} placeholder="03564-..." />
          </Field>
          <Field
            label="Teléfono celular"
            error={errors.telefonoCelular?.message}
          >
            <Input
              {...register("telefonoCelular")}
              placeholder="+54 9 3564..."
            />
          </Field>
          <Field label="Email personal" error={errors.emailPersonal?.message}>
            <Input
              type="email"
              {...register("emailPersonal")}
              placeholder="usuario@dominio.com"
            />
          </Field>
        </div>
      </section>

      {/* ===== ESTUDIOS ===== */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h3 className="text-lg font-semibold">Estudios</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              estudios.append({
                nivel: "secundaria",
                institucion: "",
                desde: "",
                hasta: "",
                titulo: "",
                enCurso: false,
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>

        {estudios.fields.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Sin estudios cargados.
          </p>
        )}

        <div className="space-y-3">
          {estudios.fields.map((field, idx) => (
            <div
              key={field.id}
              className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-3 border rounded-md bg-muted/30"
            >
              <div className="md:col-span-1">
                <Label className="text-xs">Nivel</Label>
                <Controller
                  name={`estudios.${idx}.nivel`}
                  control={control}
                  render={({ field: f }) => (
                    <Select onValueChange={f.onChange} value={f.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primaria">Primaria</SelectItem>
                        <SelectItem value="secundaria">Secundaria</SelectItem>
                        <SelectItem value="terciario">Terciario</SelectItem>
                        <SelectItem value="universitario">
                          Universitario
                        </SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Institución</Label>
                <Input {...register(`estudios.${idx}.institucion`)} />
              </div>
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="month" {...register(`estudios.${idx}.desde`)} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="month" {...register(`estudios.${idx}.hasta`)} />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Título</Label>
                  <Input {...register(`estudios.${idx}.titulo`)} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => estudios.remove(idx)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== IDIOMAS ===== */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h3 className="text-lg font-semibold">Idiomas</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              idiomas.append({
                idioma: "",
                habla: "basico",
                escritura: "basico",
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>

        {idiomas.fields.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Sin idiomas cargados.
          </p>
        )}

        <div className="space-y-3">
          {idiomas.fields.map((field, idx) => (
            <div
              key={field.id}
              className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end p-3 border rounded-md bg-muted/30"
            >
              <div>
                <Label className="text-xs">Idioma</Label>
                <Input {...register(`idiomas.${idx}.idioma`)} />
              </div>
              <div>
                <Label className="text-xs">Habla</Label>
                <Controller
                  name={`idiomas.${idx}.habla`}
                  control={control}
                  render={({ field: f }) => (
                    <Select onValueChange={f.onChange} value={f.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basico">Básico</SelectItem>
                        <SelectItem value="intermedio">Intermedio</SelectItem>
                        <SelectItem value="avanzado">Avanzado</SelectItem>
                        <SelectItem value="nativo">Nativo</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label className="text-xs">Escritura</Label>
                <Controller
                  name={`idiomas.${idx}.escritura`}
                  control={control}
                  render={({ field: f }) => (
                    <Select onValueChange={f.onChange} value={f.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basico">Básico</SelectItem>
                        <SelectItem value="intermedio">Intermedio</SelectItem>
                        <SelectItem value="avanzado">Avanzado</SelectItem>
                        <SelectItem value="nativo">Nativo</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => idiomas.remove(idx)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== ANTECEDENTES / PSICOTÉCNICO ===== */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Antecedentes
        </h3>
        <div className="space-y-3">
          <Controller
            name="antecedentesPenales"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={field.value ?? ""}
                  onCheckedChange={field.onChange}
                />
                <span className="text-sm">
                  ¿Posee antecedentes policiales/penales?
                </span>
              </label>
            )}
          />
          {antecedentes && (
            <Field label="Detalle" error={errors.antecedentesDetalle?.message}>
              <Textarea
                {...register("antecedentesDetalle")}
                rows={3}
                placeholder="Detallar..."
              />
            </Field>
          )}
          <Controller
            name="aceptaPsicotecnico"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={field.value ?? ""}
                  onCheckedChange={field.onChange}
                />
                <span className="text-sm">
                  Dispuesto/a a realizar examen psicotécnico
                </span>
              </label>
            )}
          />
        </div>
      </section>

      {/* ===== ACCIONES ===== */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => onSaveDraft?.(allValues)}
          disabled={isSubmitting}
        >
          Guardar borrador
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Siguiente: Domicilio →
        </Button>
      </div>
    </form>
  );
}

/* ----------- Helper interno ----------- */
function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      
    </div>
  );
}

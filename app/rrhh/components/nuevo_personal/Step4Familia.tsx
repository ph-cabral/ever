"use client";

import { useEffect, useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, UserPlus } from "lucide-react";

import {
  step4Schema,
  type Step4Data,
} from "@/app/rrhh/legajos/nuevo/schemas/step4";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Step4Props {
  estadoCivil?: string; // heredado del paso 1
  defaultValues?: Partial<Step4Data>;
  onSubmit: (data: Step4Data) => void;
  onBack: () => void;
  onSaveDraft?: (data: Partial<Step4Data>) => void;
}

export function Step4Familia({
  estadoCivil = "soltero",
  defaultValues,
  onSubmit,
  onBack,
  onSaveDraft,
}: Step4Props) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      estadoCivil,
      tieneCargasFamilia: false,
      medioPagoAaff: "cuenta_sueldo",
      familiares: [],
      beneficiarios: [],
      ...defaultValues,
    },
  });

  const familiares = useFieldArray({ control, name: "familiares" });
  const beneficiarios = useFieldArray({ control, name: "beneficiarios" });

  const tieneCargas = watch("tieneCargasFamilia");
  const medio = watch("medioPagoAaff");
  const familiaresWatch = watch("familiares");
  const beneficiariosWatch = watch("beneficiarios");

  // Total porcentaje en vivo
  const totalPorcentaje = useMemo(
    () => beneficiariosWatch.reduce((s, b) => s + (Number(b.porcentaje) || 0), 0),
    [beneficiariosWatch]
  );

  // Sugerir pareja/cónyuge como beneficiaria si existe en familiares y no
  // hay aún ningún beneficiario cargado
  const sugerirPareja = () => {
    const pareja = familiaresWatch.find(
      (f) => f.parentesco === "conyuge" || f.parentesco === "pareja"
    );
    if (!pareja) return;
    beneficiarios.append({
      apellidoNombre: `${pareja.apellido}, ${pareja.nombre}`,
      tipoDocumento: pareja.tipoDocumento,
      numeroDocumento: pareja.numeroDocumento,
      parentesco: pareja.parentesco === "conyuge" ? "Cónyuge" : "Pareja",
      domicilio: "",
      porcentaje: 100,
    });
  };

  // Auto-añadir pareja como beneficiaria 100% la primera vez que aparece
  useEffect(() => {
    if (beneficiarios.fields.length === 0) {
      const pareja = familiaresWatch.find(
        (f) => f.parentesco === "conyuge" || f.parentesco === "pareja"
      );
      if (pareja && pareja.apellido && pareja.nombre) {
        sugerirPareja();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familiaresWatch.length]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Datos generales */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Datos generales
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-sm">Estado civil</Label>
            <Input value={estadoCivil} disabled className="capitalize" />
            <p className="text-xs text-muted-foreground">
              Heredado del paso 1
            </p>
          </div>

          <div className="flex items-end">
            <Controller
              name="tieneCargasFamilia"
              control={control}
              render={({ field }) => (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <span className="text-sm">¿Tiene cargas de familia?</span>
                </label>
              )}
            />
          </div>

          <Field
            label="Medio de pago AAFF"
            error={errors.medioPagoAaff?.message}
          >
            <Controller
              name="medioPagoAaff"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cuenta_sueldo">Cuenta sueldo</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {medio === "otro" && (
            <Field
              label="Detalle medio de pago"
              error={errors.medioPagoAaffOtro?.message}
            >
              <Input {...register("medioPagoAaffOtro")} />
            </Field>
          )}
        </div>
      </section>

      {/* Grupo familiar */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h3 className="text-lg font-semibold">
            Grupo familiar (Form. PS.2.61)
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              familiares.append({
                parentesco: "hijo",
                apellido: "",
                nombre: "",
                tipoDocumento: "DNI",
                numeroDocumento: "",
                fechaNacimiento: "",
                nacionalidad: "Argentina",
                telefono: "",
                ocupacion: "",
                convive: true,
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" /> Agregar integrante
          </Button>
        </div>

        {familiares.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Sin integrantes cargados.
          </p>
        ) : (
          <div className="space-y-3">
            {familiares.fields.map((field, idx) => (
              <div
                key={field.id}
                className="border rounded-md p-3 bg-muted/30 space-y-2"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Parentesco</Label>
                    <Controller
                      name={`familiares.${idx}.parentesco`}
                      control={control}
                      render={({ field: f }) => (
                        <Select onValueChange={f.onChange} value={f.value}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="conyuge">Cónyuge</SelectItem>
                            <SelectItem value="pareja">Pareja</SelectItem>
                            <SelectItem value="hijo">Hijo/a</SelectItem>
                            <SelectItem value="padre">Padre</SelectItem>
                            <SelectItem value="madre">Madre</SelectItem>
                            <SelectItem value="hermano">Hermano/a</SelectItem>
                            <SelectItem value="otro">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Apellido</Label>
                    <Input {...register(`familiares.${idx}.apellido`)} />
                  </div>
                  <div>
                    <Label className="text-xs">Nombre</Label>
                    <Input {...register(`familiares.${idx}.nombre`)} />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Controller
                        name={`familiares.${idx}.tipoDocumento`}
                        control={control}
                        render={({ field: f }) => (
                          <Select onValueChange={f.onChange} value={f.value}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DNI">DNI</SelectItem>
                              <SelectItem value="LE">LE</SelectItem>
                              <SelectItem value="LC">LC</SelectItem>
                              <SelectItem value="PAS">PAS</SelectItem>
                              <SelectItem value="CI">CI</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">N° documento</Label>
                      <Input
                        {...register(`familiares.${idx}.numeroDocumento`)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                  <div>
                    <Label className="text-xs">F. nacimiento</Label>
                    <Controller
                      control={control}
                      name={`familiares.${idx}.fechaNacimiento`}
                      render={({ field }) => (
                        <DateField
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nacionalidad</Label>
                    <Input
                      {...register(`familiares.${idx}.nacionalidad`)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Teléfono</Label>
                    <Input {...register(`familiares.${idx}.telefono`)} />
                  </div>
                  <div>
                    <Label className="text-xs">Ocupación</Label>
                    <Input {...register(`familiares.${idx}.ocupacion`)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Controller
                      name={`familiares.${idx}.convive`}
                      control={control}
                      render={({ field: f }) => (
                        <label className="flex items-center gap-1 text-sm">
                          <Checkbox
                            checked={f.value}
                            onCheckedChange={f.onChange}
                          />
                          Convive
                        </label>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => familiares.remove(idx)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Beneficiarios seguro de vida */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h3 className="text-lg font-semibold">
            Beneficiarios seguro de vida obligatorio (Dto. 1567/74)
          </h3>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sugerirPareja}
              title="Auto-completar con la pareja del paso anterior"
            >
              <UserPlus className="w-4 h-4 mr-1" /> Sugerir pareja
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                beneficiarios.append({
                  apellidoNombre: "",
                  tipoDocumento: "DNI",
                  numeroDocumento: "",
                  parentesco: "",
                  domicilio: "",
                  porcentaje: 0,
                })
              }
            >
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          </div>
        </div>

        {beneficiarios.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground italic mb-2">
            Sin beneficiarios. Agregá al menos uno.
          </p>
        ) : (
          <div className="space-y-2">
            {beneficiarios.fields.map((field, idx) => (
              <div
                key={field.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 border rounded-md bg-muted/30"
              >
                <div className="md:col-span-3">
                  <Label className="text-xs">Apellido y nombre</Label>
                  <Input
                    {...register(`beneficiarios.${idx}.apellidoNombre`)}
                  />
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs">Tipo</Label>
                  <Controller
                    name={`beneficiarios.${idx}.tipoDocumento`}
                    control={control}
                    render={({ field: f }) => (
                      <Select onValueChange={f.onChange} value={f.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DNI">DNI</SelectItem>
                          <SelectItem value="LE">LE</SelectItem>
                          <SelectItem value="LC">LC</SelectItem>
                          <SelectItem value="PAS">PAS</SelectItem>
                          <SelectItem value="CI">CI</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">N° documento</Label>
                  <Input
                    {...register(`beneficiarios.${idx}.numeroDocumento`)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Parentesco</Label>
                  <Input {...register(`beneficiarios.${idx}.parentesco`)} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Domicilio</Label>
                  <Input {...register(`beneficiarios.${idx}.domicilio`)} />
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs">%</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    {...register(`beneficiarios.${idx}.porcentaje`, {
                      valueAsNumber: true,
                    })}
                  />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => beneficiarios.remove(idx)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total porcentaje */}
        <div
          className={`mt-3 flex items-center justify-end gap-3 text-sm font-medium ${
            Math.abs(totalPorcentaje - 100) < 0.01
              ? "text-emerald-600"
              : "text-destructive"
          }`}
        >
          <span>Total: {totalPorcentaje.toFixed(2)}%</span>
          {Math.abs(totalPorcentaje - 100) < 0.01 ? (
            <span>✓ correcto</span>
          ) : (
            <span>(debe sumar 100%)</span>
          )}
        </div>

        {errors.beneficiarios && !Array.isArray(errors.beneficiarios) && (
          <p className="text-xs text-destructive mt-2">
            {(errors.beneficiarios as { message?: string }).message}
          </p>
        )}
      </section>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Atrás
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onSaveDraft?.(getValues())}
            disabled={isSubmitting}
          >
            Guardar borrador
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Siguiente: Seguro / ART →
          </Button>
        </div>
      </div>
    </form>
  );
}

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

"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Upload } from "lucide-react";

import { step2Schema, type Step2Data } from "@/app/rrhh/legajos/nuevo/schemas/step2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
  "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán",
];

interface Step2Props {
  defaultValues?: Partial<Step2Data>;
  onSubmit: (data: Step2Data) => void;
  onBack: () => void;
  onSaveDraft?: (data: Partial<Step2Data>) => void;
}

export function Step2Domicilio({
  defaultValues,
  onSubmit,
  onBack,
  onSaveDraft,
}: Step2Props) {
  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      provincia: "Córdoba",
      ddjjConformidad: false,
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Domicilio real
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-3">
            <Field label="Calle" error={errors.calle?.message} required>
              <Input {...register("calle")} />
            </Field>
          </div>
          <div className="md:col-span-1">
            <Field label="Número" error={errors.numero?.message} required>
              <Input {...register("numero")} />
            </Field>
          </div>
          <div className="md:col-span-1">
            <Field label="Piso" error={errors.piso?.message}>
              <Input {...register("piso")} />
            </Field>
          </div>
          <div className="md:col-span-1">
            <Field label="Depto" error={errors.depto?.message}>
              <Input {...register("depto")} />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Código postal" error={errors.codigoPostal?.message} required>
              <Input
                {...register("codigoPostal")}
                inputMode="numeric"
                placeholder="2400"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Localidad" error={errors.localidad?.message} required>
              <Input {...register("localidad")} placeholder="San Francisco" />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Provincia" error={errors.provincia?.message} required>
              <Controller
                name="provincia"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVINCIAS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Comprobante y DDJJ
        </h3>

        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-md p-6 text-center bg-muted/20">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              Foto/escaneo de servicio o comprobante a nombre del empleado
            </p>
            <Input
              type="file"
              accept="image/*,application/pdf"
              {...register("comprobanteUrl")}
              className="max-w-sm mx-auto"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Formatos: JPG, PNG, PDF (máx. 5 MB)
            </p>
          </div>

          <div className="rounded-md border p-4 bg-amber-50 dark:bg-amber-950/20">
            <Controller
              name="ddjjConformidad"
              control={control}
              render={({ field }) => (
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-relaxed">
                    <strong>Declaración Jurada de domicilio:</strong> declaro
                    bajo juramento que los datos consignados son verídicos y
                    constituyen mi domicilio real, comprometiéndome a notificar
                    cualquier modificación dentro de las 48 hs.
                  </span>
                </label>
              )}
            />
            {errors.ddjjConformidad && (
              <p className="text-xs text-destructive mt-2">
                {errors.ddjjConformidad.message}
              </p>
            )}
          </div>
        </div>
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
            Siguiente: Laboral / ARCA →
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label, error, required, children,
}: {
  label: string; error?: string; required?: boolean; children: React.ReactNode;
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

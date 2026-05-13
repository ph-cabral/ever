"use client";

import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Laptop } from "lucide-react";

import {
  step6Schema,
  type Step6Data,
} from "@/app/rrhh/legajos/nuevo/schemas/step6";

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

interface Step6Props {
  defaultValues?: Partial<Step6Data>;
  empleadoNombre?: string; // para mostrar en cláusulas
  onSubmit: (data: Step6Data) => void;
  onBack: () => void;
  onSaveDraft?: (data: Partial<Step6Data>) => void;
}

const TIPOS_EQUIPO: Array<{ value: Step6Data["equipos"][number]["tipo"]; label: string }> = [
  { value: "notebook", label: "Notebook" },
  { value: "desktop", label: "PC de escritorio" },
  { value: "monitor", label: "Monitor" },
  { value: "celular", label: "Celular" },
  { value: "tablet", label: "Tablet" },
  { value: "impresora", label: "Impresora" },
  { value: "perifericos", label: "Periféricos (mouse/teclado/etc)" },
  { value: "otro", label: "Otro" },
];

export function Step6Equipos({
  defaultValues,
  empleadoNombre = "el/la empleado/a",
  onSubmit,
  onBack,
  onSaveDraft,
}: Step6Props) {
  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Step6Data>({
    resolver: zodResolver(step6Schema),
    defaultValues: {
      equipos: [],
      aceptaClausulas: false,
      jurisdiccion: "San Francisco, Córdoba",
      fechaFirma: new Date().toISOString().slice(0, 10),
      ...defaultValues,
    },
  });

  const equipos = useFieldArray({ control, name: "equipos" });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Tabla de equipos */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Laptop className="w-5 h-5" />
            Equipamiento entregado
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              equipos.append({
                tipo: "notebook",
                marca: "",
                modelo: "",
                detalle: "",
                numeroSerie: "",
                fechaEntrega: new Date().toISOString().slice(0, 10),
                estado: "nuevo",
                observaciones: "",
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" /> Agregar equipo
          </Button>
        </div>

        {equipos.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Sin equipos cargados. Si no se entrega equipamiento, dejar vacío y
            avanzar.
          </p>
        ) : (
          <div className="space-y-3">
            {equipos.fields.map((field, idx) => (
              <div
                key={field.id}
                className="border rounded-md p-3 bg-muted/30 space-y-2"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Controller
                      name={`equipos.${idx}.tipo`}
                      control={control}
                      render={({ field: f }) => (
                        <Select onValueChange={f.onChange} value={f.value}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPOS_EQUIPO.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Marca</Label>
                    <Input
                      {...register(`equipos.${idx}.marca`)}
                      placeholder="Lenovo"
                    />
                    {errors.equipos?.[idx]?.marca && (
                      <p className="text-xs text-destructive mt-0.5">
                        {errors.equipos[idx]?.marca?.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Modelo</Label>
                    <Input
                      {...register(`equipos.${idx}.modelo`)}
                      placeholder="ThinkPad E14"
                    />
                    {errors.equipos?.[idx]?.modelo && (
                      <p className="text-xs text-destructive mt-0.5">
                        {errors.equipos[idx]?.modelo?.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">N° de serie</Label>
                    <Input
                      {...register(`equipos.${idx}.numeroSerie`)}
                      placeholder="PF3XXXXX"
                    />
                    {errors.equipos?.[idx]?.numeroSerie && (
                      <p className="text-xs text-destructive mt-0.5">
                        {errors.equipos[idx]?.numeroSerie?.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                  <div className="md:col-span-2">
                    <Label className="text-xs">Detalle / specs</Label>
                    <Input
                      {...register(`equipos.${idx}.detalle`)}
                      placeholder="i5 12va, 16GB RAM, SSD 512GB"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha entrega</Label>
                    <Controller
                      control={control}
                      name={`equipos.${idx}.fechaEntrega`}
                      render={({ field }) => (
                        <DateField
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <Controller
                      name={`equipos.${idx}.estado`}
                      control={control}
                      render={({ field: f }) => (
                        <Select onValueChange={f.onChange} value={f.value}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nuevo">Nuevo</SelectItem>
                            <SelectItem value="usado">Usado</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-11">
                    <Label className="text-xs">Observaciones</Label>
                    <Input
                      {...register(`equipos.${idx}.observaciones`)}
                      placeholder="Ralladuras en tapa, cargador incluido, etc."
                    />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => equipos.remove(idx)}
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

      {/* Cláusulas de uso y devolución */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Cláusulas de uso y devolución
        </h3>

        <div className="rounded-md border p-4 bg-muted/20 text-sm leading-relaxed space-y-3 max-h-72 overflow-y-auto">
          <p>
            <strong>1. Propiedad.</strong> Los equipos detallados son propiedad
            exclusiva de <strong>Ever Wear S.A.</strong> y se entregan a{" "}
            <strong>{empleadoNombre}</strong> en carácter de comodato precario,
            para uso exclusivamente laboral durante la vigencia de la relación
            de empleo.
          </p>
          <p>
            <strong>2. Cuidado y conservación.</strong> El/la empleado/a se
            obliga a usar los bienes con la diligencia de un buen padre de
            familia, evitando daños, sustracciones o usos ajenos al laboral. Es
            responsable por roturas, pérdidas o deterioros producidos por
            negligencia, dolo o uso indebido.
          </p>
          <p>
            <strong>3. Confidencialidad.</strong> La información, software,
            credenciales y datos almacenados o accesibles desde los equipos son
            confidenciales y de propiedad de la empresa. Está prohibida su
            divulgación, copia o uso fuera del ámbito laboral.
          </p>
          <p>
            <strong>4. Mantenimiento y software.</strong> Solo el área de
            Sistemas está autorizada a realizar instalaciones, modificaciones
            de configuración o mantenimiento. El/la empleado/a no podrá
            instalar software no autorizado ni alterar la configuración de
            seguridad.
          </p>
          <p>
            <strong>5. Devolución.</strong> Al cesar la relación laboral —por
            cualquier causa— o cuando la empresa lo requiera, el/la empleado/a
            deberá restituir los bienes en idénticas condiciones a las
            recibidas, salvo el desgaste normal por uso. La no devolución
            facultará a la empresa a deducir su valor de la liquidación final,
            sin perjuicio de las acciones legales correspondientes.
          </p>
          <p>
            <strong>6. Jurisdicción.</strong> Para cualquier controversia
            derivada del presente, las partes se someten a la jurisdicción de
            los Tribunales Ordinarios de{" "}
            <strong>San Francisco, Provincia de Córdoba</strong>, renunciando a
            cualquier otro fuero.
          </p>
        </div>

        <div className="mt-4 rounded-md border p-4 bg-amber-50 dark:bg-amber-950/20">
          <Controller
            name="aceptaClausulas"
            control={control}
            render={({ field }) => (
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed">
                  Declaro haber leído, comprendido y aceptado las cláusulas de
                  uso y devolución, recibiendo de conformidad los equipos
                  detallados.
                </span>
              </label>
            )}
          />
          {errors.aceptaClausulas && (
            <p className="text-xs text-destructive mt-2">
              {errors.aceptaClausulas.message}
            </p>
          )}
        </div>
      </section>

      {/* Firma y fecha */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Firma y conformidad
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Fecha de firma"
            error={errors.fechaFirma?.message}
            required
          >
            <Controller
              control={control}
              name="fechaFirma"
              render={({ field }) => (
                <DateField value={field.value ?? ""} onChange={field.onChange} />
              )}
            />
          </Field>
          <div className="space-y-1">
            <Label className="text-sm">Jurisdicción</Label>
            <Input {...register("jurisdiccion")} disabled />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          La firma física del empleado se adjuntará al imprimir el acta de
          entrega.
        </p>
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
            Finalizar y crear legajo ✓
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

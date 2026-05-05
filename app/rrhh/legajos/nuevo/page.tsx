"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { useWizardStore } from "./_wizard/store/wizardStore";
import { STEPS } from "./_wizard/types/wizard";
import { Stepper } from "./_wizard/components/Stepper";

import { Step1Personales } from "@/app/rrhh/components/nuevo_personal/Step1Personales";
import { Step2Domicilio }  from "@/app/rrhh/components/nuevo_personal/Step2Domicilio";
import { Step3Laboral }    from "@/app/rrhh/components/nuevo_personal/Step3Laboral";
import { Step4Familia }    from "@/app/rrhh/components/nuevo_personal/Step4Familia";
import { Step5SeguroArt }  from "@/app/rrhh/components/nuevo_personal/Step5SeguroArt";
import { Step6Equipos }    from "@/app/rrhh/components/nuevo_personal/Step6Equipos";

export default function NuevoLegajoPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    data,
    completed,
    currentStep,
    setStepData,
    markCompleted,
    goTo,
    next,
    prev,
    reset,
    visited 
  } = useWizardStore();


  // Evitar flicker entre SSR y rehidratación de Zustand persistido
  useEffect(() => setHydrated(true), []);

  const stepMeta = STEPS.find((s) => s.key === currentStep)!;

  // Helper genérico: handler de submit por paso
  const makeOnSubmit = <K extends keyof typeof data>(key: K) =>
    (payload: typeof data[K]) => {
      setStepData(key, payload);
      markCompleted(key as any, true);
      next();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

  const makeOnDraft = <K extends keyof typeof data>(key: K) =>
    (payload: Partial<typeof data[K]>) => {
      setStepData(key, payload as any);
      toast.success("Borrador guardado", {
        description: "Los datos se conservan en este navegador.",
      });
    };

  const handleFinalizar = async (payload: typeof data.step6) => {
    setStepData("step6", payload);
    markCompleted("step6", true);

    const fullPayload = { ...data, step6: payload };

    setSubmitting(true);
    try {
      // TODO: cuando esté la API, descomentar:
      // const res = await fetch("/api/rrhh/legajos", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(fullPayload),
      // });
      // if (!res.ok) throw new Error("Error al crear legajo");
      // const { legajoCodigo } = await res.json();

      // Mock por ahora:
      console.log("Legajo a crear:", fullPayload);
      const legajoCodigo = "L-002";

      toast.success(`Legajo ${legajoCodigo} creado correctamente`);
      reset();
      router.push(`/rrhh/legajos/${legajoCodigo}`);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo crear el legajo. Reintentá.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    if (confirm("¿Descartar todo el borrador y empezar de cero?")) {
      reset();
      toast.info("Borrador descartado");
    }
  };

  if (!hydrated) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">Cargando borrador…</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/rrhh/legajos")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nuevo legajo</h1>
            <p className="text-sm text-muted-foreground">
              Paso {stepMeta.index} de {STEPS.length} — {stepMeta.title}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={submitting}
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Descartar borrador
        </Button>
      </div>

      {/* Stepper */}
      <Card>
        <CardContent className="py-6">
          <Stepper
            current={currentStep}
            completed={completed}
            visited={visited}
            onSelect={goTo}
          />
        </CardContent>
      </Card>

      {/* Form actual */}
      <Card>
        <CardHeader>
          <CardTitle>{stepMeta.title}</CardTitle>
          <CardDescription>
            Completá los datos. El borrador se guarda automáticamente al pasar
            al siguiente paso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === "step1" && (
            <Step1Personales
              defaultValues={data.step1}
              onSubmit={makeOnSubmit("step1")}
              onSaveDraft={makeOnDraft("step1")}
            />
          )}

          {currentStep === "step2" && (
            <Step2Domicilio
              defaultValues={data.step2}
              onSubmit={makeOnSubmit("step2")}
              onBack={prev}
              onSaveDraft={makeOnDraft("step2")}
            />
          )}

          {currentStep === "step3" && (
            <Step3Laboral
              defaultValues={data.step3}
              onSubmit={makeOnSubmit("step3")}
              onBack={prev}
              onSaveDraft={makeOnDraft("step3")}
            />
          )}

          {currentStep === "step4" && (
            <Step4Familia
              estadoCivil={data.step1.estadoCivil}
              defaultValues={data.step4}
              onSubmit={makeOnSubmit("step4")}
              onBack={prev}
              onSaveDraft={makeOnDraft("step4")}
            />
          )}

          {currentStep === "step5" && (
            <Step5SeguroArt
              defaultValues={data.step5}
              onSubmit={makeOnSubmit("step5")}
              onBack={prev}
              onSaveDraft={makeOnDraft("step5")}
            />
          )}

          {currentStep === "step6" && (
            <Step6Equipos
              defaultValues={data.step6}
              empleadoNombre={
                data.step1.nombre && data.step1.apellido
                  ? `${data.step1.nombre} ${data.step1.apellido}`
                  : undefined
              }
              onSubmit={handleFinalizar}
              onBack={prev}
              onSaveDraft={makeOnDraft("step6")}
            />
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // guardar lo que haya en el store y avanzar
            next();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          disabled={currentStep === "step6"}
        >
          Saltar este paso →
        </Button>
      </div>
    </div>
  );
}

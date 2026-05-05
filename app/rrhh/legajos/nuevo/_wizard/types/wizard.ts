import type { Step1Data } from "@/app/rrhh/legajos/nuevo/schemas/step1";
import type { Step2Data } from "@/app/rrhh/legajos/nuevo/schemas/step2";
import type { Step3Data } from "@/app/rrhh/legajos/nuevo/schemas/step3";
import type { Step4Data } from "@/app/rrhh/legajos/nuevo/schemas/step4";
import type { Step5Data } from "@/app/rrhh/legajos/nuevo/schemas/step5";
import type { Step6Data } from "@/app/rrhh/legajos/nuevo/schemas/step6";

export type StepKey = "step1" | "step2" | "step3" | "step4" | "step5" | "step6";

export interface WizardData {
  step1: Partial<Step1Data>;
  step2: Partial<Step2Data>;
  step3: Partial<Step3Data>;
  step4: Partial<Step4Data>;
  step5: Partial<Step5Data>;
  step6: Partial<Step6Data>;
}

export type StepStatus = "pending" | "current" | "completed";

export interface StepMeta {
  key: StepKey;
  index: number; // 1..6
  title: string;
  short: string;
}

export const STEPS: StepMeta[] = [
  { key: "step1", index: 1, title: "Datos personales", short: "Personales" },
  { key: "step2", index: 2, title: "Domicilio",        short: "Domicilio" },
  { key: "step3", index: 3, title: "Laboral / ARCA",   short: "Laboral" },
  { key: "step4", index: 4, title: "Familia / ANSES",  short: "Familia" },
  { key: "step5", index: 5, title: "Seguro / ART",     short: "Seguro/ART" },
  { key: "step6", index: 6, title: "Equipos",          short: "Equipos" },
];

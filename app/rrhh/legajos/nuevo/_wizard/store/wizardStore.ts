// "use client";

// import { create } from "zustand";
// import { persist, createJSONStorage } from "zustand/middleware";
// import type { StepKey, WizardData } from "../types/wizard";

// interface WizardState {
//   // Datos por paso
//   data: WizardData;
//   // Pasos completados (validados con onSubmit)
//   completed: Record<StepKey, boolean>;
//   // Paso actualmente visible
//   currentStep: StepKey;
//   // Acciones
//   setStepData: <K extends StepKey>(key: K, payload: WizardData[K]) => void;
//   markCompleted: (key: StepKey, completed?: boolean) => void;
//   goTo: (key: StepKey) => void;
//   next: () => void;
//   prev: () => void;
//   reset: () => void;
// }

// const STEP_ORDER: StepKey[] = [
//   "step1", "step2", "step3", "step4", "step5", "step6",
// ];

// const emptyData: WizardData = {
//   step1: {}, step2: {}, step3: {}, step4: {}, step5: {}, step6: {},
// };

// const emptyCompleted: Record<StepKey, boolean> = {
//   step1: false, step2: false, step3: false,
//   step4: false, step5: false, step6: false,
// };

// export const useWizardStore = create<WizardState>()(
//   persist(
//     (set, get) => ({
//       data: emptyData,
//       completed: emptyCompleted,
//       currentStep: "step1",

//       setStepData: (key, payload) =>
//         set((s) => ({
//           data: { ...s.data, [key]: { ...s.data[key], ...payload } },
//         })),

//       markCompleted: (key, completed = true) =>
//         set((s) => ({
//           completed: { ...s.completed, [key]: completed },
//         })),

//       goTo: (key) => set({ currentStep: key }),

//       next: () => {
//         const { currentStep } = get();
//         const idx = STEP_ORDER.indexOf(currentStep);
//         if (idx < STEP_ORDER.length - 1) {
//           set({ currentStep: STEP_ORDER[idx + 1] });
//         }
//       },

//       prev: () => {
//         const { currentStep } = get();
//         const idx = STEP_ORDER.indexOf(currentStep);
//         if (idx > 0) {
//           set({ currentStep: STEP_ORDER[idx - 1] });
//         }
//       },

//       reset: () =>
//         set({
//           data: emptyData,
//           completed: emptyCompleted,
//           currentStep: "step1",
//         }),
//     }),
//     {
//       name: "everwear:wizard:legajo-nuevo",
//       storage: createJSONStorage(() => localStorage),
//       version: 1,
//     }
//   )
// );

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StepKey, WizardData } from "../types  /wizard";

interface WizardState {
  data: WizardData;
  completed: Record<StepKey, boolean>;
  visited: Record<StepKey, boolean>;
  currentStep: StepKey;
  setStepData: <K extends StepKey>(
    key: K,
    payload: Partial<WizardData[K]>,
  ) => void;
  markCompleted: (key: StepKey, completed?: boolean) => void;
  markVisited: (key: StepKey) => void;
  goTo: (key: StepKey) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

const STEP_ORDER: StepKey[] = [
  "step1",
  "step2",
  "step3",
  "step4",
  "step5",
  "step6",
];

const emptyData: WizardData = {
  step1: {},
  step2: {},
  step3: {},
  step4: {},
  step5: {},
  step6: {},
};
const emptyFlags: Record<StepKey, boolean> = {
  step1: false,
  step2: false,
  step3: false,
  step4: false,
  step5: false,
  step6: false,
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      data: emptyData,
      completed: { ...emptyFlags },
      visited: {
        step1: true,
        step2: false,
        step3: false,
        step4: false,
        step5: false,
        step6: false,
      },
      currentStep: "step1",

      setStepData: (key, payload) =>
        set((s) => ({
          data: { ...s.data, [key]: { ...s.data[key], ...payload } },
        })),

      markCompleted: (key, completed = true) =>
        set((s) => ({ completed: { ...s.completed, [key]: completed } })),

      markVisited: (key) =>
        set((s) => ({ visited: { ...s.visited, [key]: true } })),

      goTo: (key) => {
        set((s) => ({
          currentStep: key,
          visited: { ...s.visited, [key]: true },
        }));
      },

      next: () => {
        const { currentStep } = get();
        const idx = STEP_ORDER.indexOf(currentStep);
        if (idx < STEP_ORDER.length - 1) {
          const nextKey = STEP_ORDER[idx + 1];
          set((s) => ({
            currentStep: nextKey,
            visited: { ...s.visited, [nextKey]: true },
          }));
        }
      },

      prev: () => {
        const { currentStep } = get();
        const idx = STEP_ORDER.indexOf(currentStep);
        if (idx > 0) set({ currentStep: STEP_ORDER[idx - 1] });
      },

      reset: () =>
        set({
          data: emptyData,
          completed: { ...emptyFlags },
          visited: {
            step1: true,
            step2: false,
            step3: false,
            step4: false,
            step5: false,
            step6: false,
          },
          currentStep: "step1",
        }),
    }),
    {
      name: "everwear:wizard:legajo-nuevo",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState: any, version) => {
        // v1 → v2: agregar visited
        if (version < 2) {
          return {
            ...persistedState,
            visited: {
              step1: true,
              step2: false,
              step3: false,
              step4: false,
              step5: false,
              step6: false,
            },
          };
        }
        return persistedState;
      },
    },
  ),
);
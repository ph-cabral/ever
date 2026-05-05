// "use client";

// import { Check } from "lucide-react";
// import { STEPS, type StepKey } from "../types/wizard";

// interface StepperProps {
//   current: StepKey;
//   completed: Record<StepKey, boolean>;
//   onSelect: (key: StepKey) => void;
// }

// export function Stepper({ current, completed, onSelect }: StepperProps) {
//   return (
//     <nav aria-label="Progreso del wizard" className="w-full">
//       <ol className="flex items-center justify-between gap-2">
//         {STEPS.map((step, i) => {
//           const isCurrent = step.key === current;
//           const isCompleted = completed[step.key];
//           // Permitimos navegar a pasos completados o al actual
//           const canClick = isCompleted || isCurrent;

//           return (
//             <li
//               key={step.key}
//               className="flex-1 flex items-center gap-2"
//             >
//               <button
//                 type="button"
//                 disabled={!canClick}
//                 onClick={() => canClick && onSelect(step.key)}
//                 className={[
//                   "flex items-center gap-2 group transition",
//                   canClick ? "cursor-pointer" : "cursor-not-allowed opacity-60",
//                 ].join(" ")}
//               >
//                 <span
//                   className={[
//                     "w-9 h-9 rounded-full flex items-center justify-center",
//                     "text-sm font-semibold border-2 transition-colors shrink-0",
//                     isCompleted &&
//                       "bg-emerald-600 border-emerald-600 text-white",
//                     !isCompleted && isCurrent &&
//                       "bg-blue-600 border-blue-600 text-white",
//                     !isCompleted && !isCurrent &&
//                       "bg-muted border-muted-foreground/30 text-muted-foreground",
//                   ]
//                     .filter(Boolean)
//                     .join(" ")}
//                 >
//                   {isCompleted ? (
//                     <Check className="w-4 h-4" />
//                   ) : (
//                     step.index
//                   )}
//                 </span>
//                 <span
//                   className={[
//                     "text-xs md:text-sm font-medium hidden sm:inline",
//                     isCurrent ? "text-foreground" : "text-muted-foreground",
//                   ].join(" ")}
//                 >
//                   {step.short}
//                 </span>
//               </button>

//               {i < STEPS.length - 1 && (
//                 <span
//                   className={[
//                     "flex-1 h-0.5 transition-colors",
//                     completed[step.key]
//                       ? "bg-emerald-600"
//                       : "bg-muted-foreground/20",
//                   ].join(" ")}
//                 />
//               )}
//             </li>
//           );
//         })}
//       </ol>
//     </nav>
//   );
// }

"use client";

import { Check } from "lucide-react";
import { STEPS, type StepKey } from "../types/wizard";

interface StepperProps {
  current: StepKey;
  completed: Record<StepKey, boolean>;
  visited: Record<StepKey, boolean>;
  onSelect: (key: StepKey) => void;
}

export function Stepper({
  current,
  completed,
  visited,
  onSelect,
}: StepperProps) {
  return (
    <nav aria-label="Progreso del wizard" className="w-full">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, i) => {
          const isCurrent = step.key === current;
          const isCompleted = completed[step.key];
          const isVisited = visited[step.key];

          return (
            <li key={step.key} className="flex-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(step.key)}
                className="flex items-center gap-2 group transition cursor-pointer"
              >
                <span
                  className={[
                    "w-9 h-9 rounded-full flex items-center justify-center",
                    "text-sm font-semibold border-2 transition-colors shrink-0",
                    isCompleted &&
                      "bg-emerald-600 border-emerald-600 text-white",
                    !isCompleted &&
                      (isCurrent || isVisited) &&
                      "bg-blue-600 border-blue-600 text-white",
                    !isCompleted &&
                      !isCurrent &&
                      !isVisited &&
                      "bg-muted border-muted-foreground/30 text-muted-foreground",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : step.index}
                </span>
                <span
                  className={[
                    "text-xs md:text-sm font-medium hidden sm:inline",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {step.short}
                </span>
              </button>

              {i < STEPS.length - 1 && (
                <span
                  className={[
                    "flex-1 h-0.5 transition-colors",
                    completed[step.key]
                      ? "bg-emerald-600"
                      : "bg-muted-foreground/20",
                  ].join(" ")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
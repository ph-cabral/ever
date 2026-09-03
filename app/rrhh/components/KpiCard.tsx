"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  // ReactNode y no solo string: permite valores apilados (varias líneas) sin
  // duplicar el componente.
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  accent?: "yellow" | "green" | "blue" | "orange" | "zinc";
};

const ACCENT_CLASSES: Record<NonNullable<Props["accent"]>, string> = {
  yellow: "text-yellow-400",
  green: "text-green-400",
  blue: "text-blue-400",
  orange: "text-orange-400",
  zinc: "text-zinc-300",
};

export default function KpiCard({ label, value, hint, icon: Icon, accent = "yellow" }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        {Icon && <Icon size={16} className="text-zinc-600 shrink-0" />}
      </div>
      <p className={`mt-2 text-2xl font-bold ${ACCENT_CLASSES[accent]}`}>{value}</p>
      {hint && <p className="text-xs text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

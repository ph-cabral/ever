"use client";

import { everWearTheme as t } from "@/lib/rrhh/theme";
import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
};

export default function CardGraph({ title, children, className = "" }: Props) {
  return (
    <div
      className={`rounded-lg border p-4 ${className}`}
      style={{ background: t.bgCard, borderColor: t.border }}
    >
      <h3 className="mb-4 text-m font-semibold" style={{ color: t.text }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

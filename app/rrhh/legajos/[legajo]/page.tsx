"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function LegajoDetallePage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/rrhh/legajos"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver
        </Link>
        <h1 className="text-2xl font-medium">Detalle de legajo</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        TODO: mostrar datos del legajo seleccionado.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function LegajoDetallePage() {
  const { legajo } = useParams<{ legajo: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/rrhh/legajos/${legajo}`);
        if (!res.ok) throw new Error("No encontrado");
        setData(await res.json());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [legajo]);

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
        <h1 className="text-2xl font-medium">
          {data ? data.nombre : "Detalle de legajo"}
        </h1>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
          {Object.entries(data)
            .filter(([, v]) => v !== null && typeof v !== "object")
            .map(([k, v]) => (
              <div key={k} className="border-b pb-1">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-sm">{String(v)}</dd>
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}

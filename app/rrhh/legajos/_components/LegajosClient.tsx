"use client";
// app/rrhh/legajos/_components/LegajosClient.tsx
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { OPC } from "@/lib/rrhh/legajoFields";

type Row = {
  id: number;
  codigo: string | null;
  nombre: string;
  dni: string | null;
  employeeNo: string | null;
  estado: string;
  sector: string;
};
type Sector = { id: number; nombre: string };
type Filtros = { q: string; estado: string; sectorId: string };

const ESTADO_CLASS: Record<string, string> = {
  ACTIVO: "bg-green-100 text-green-700",
  INACTIVO: "bg-gray-100 text-gray-600",
  SUSPENDIDO: "bg-amber-100 text-amber-700",
  BAJA: "bg-red-100 text-red-700",
};

function Avatar({ dni, nombre }: { dni: string | null; nombre: string }) {
  const [err, setErr] = useState(false);
  const iniciales = nombre.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  if (!dni || err) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
        {iniciales || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/rrhh/legajos/foto/${dni}`}
      alt={nombre}
      onError={() => setErr(true)}
      className="h-9 w-9 rounded-full object-cover"
    />
  );
}

export default function LegajosClient({
  legajos,
  sectores,
  filtros,
}: {
  legajos: Row[];
  sectores: Sector[];
  filtros: Filtros;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filtros.q);
  const [estado, setEstado] = useState(filtros.estado);
  const [sectorId, setSectorId] = useState(filtros.sectorId);

  const push = useCallback(
    (v: Filtros) => {
      const p = new URLSearchParams();
      if (v.q) p.set("q", v.q);
      if (v.estado) p.set("estado", v.estado);
      if (v.sectorId) p.set("sectorId", v.sectorId);
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname]
  );

  // debounce de la búsqueda de texto
  useEffect(() => {
    const t = setTimeout(() => push({ q, estado, sectorId }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const inputCls = "h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500";

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Legajos</h1>
        <span className="text-sm text-slate-500">{legajos.length} resultados</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className={`${inputCls} min-w-64 flex-1`}
          placeholder="Buscar por nombre, DNI, CUIL, código, N° empleado…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={inputCls}
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            push({ q, estado: e.target.value, sectorId });
          }}
        >
          <option value="">Todos los estados</option>
          {OPC.estado.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={sectorId}
          onChange={(e) => {
            setSectorId(e.target.value);
            push({ q, estado, sectorId: e.target.value });
          }}
        >
          <option value="">Todos los sectores</option>
          {sectores.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium"></th>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">DNI</th>
              <th className="px-3 py-2 font-medium">N° empleado</th>
              <th className="px-3 py-2 font-medium">Sector</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {legajos.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Avatar dni={l.dni} nombre={l.nombre} />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/rrhh/legajos/${l.id}`} className="font-medium text-blue-600 hover:underline">
                    {l.nombre}
                  </Link>
                  {l.codigo && <span className="ml-2 text-xs text-slate-400">#{l.codigo}</span>}
                </td>
                <td className="px-3 py-2 tabular-nums">{l.dni ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{l.employeeNo ?? "—"}</td>
                <td className="px-3 py-2">{l.sector || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[l.estado] ?? "bg-slate-100 text-slate-600"}`}>
                    {l.estado}
                  </span>
                </td>
              </tr>
            ))}
            {legajos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

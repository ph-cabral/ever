// app/rrhh/legajos/[legajo]/page.tsx  (server component)
import { notFound } from "next/navigation";
import { getLegajoFormValues } from "@/lib/rrhh/legajoService";
import LegajoEditor from "./LegajoEditor";

export const dynamic = "force-dynamic";

export default async function LegajoDetallePage({ params }: { params: Promise<{ legajo: string }> }) {
  const id = Number((await params).legajo);
  if (!Number.isInteger(id)) notFound();

  const values = await getLegajoFormValues(id);
  if (!values) notFound();

  return <LegajoEditor id={id} initial={values} />;
}

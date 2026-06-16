import { IndicadoresDashboard } from "./IndicadoresDashboard";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic"; // ← NUEVA: no prerender, mata el EACCES

// ── Helpers ───────────────────────────────────────────────────────────────────
function horasAHHMM(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}:${String(mm).padStart(2, "0")}hs`;
}

function mapearMes(m: any) {
  const reg_a_conf = m.Tiempo_Entre_Reg_Confirmacion ?? 0;
  const conf_a_arm = m.Tiempo_Entre_Confirm_IniArmado ?? 0;
  const arm_a_cierre = m.Tiempo_Entre_Armado_Cierre ?? 0;
  const reg_a_susp = m.Tiempo_Entre_Reg_Suspencion ?? 0;
  const susp_a_conf = m.Tiempo_E_Susp_Confirmacion ?? 0;

  return {
    nombre_mes: m.nombre_mes,
    total_ops_unicas: m.total_ops,
    reg_a_conf,
    conf_a_arm,
    arm_a_cierre,
    reg_a_susp,
    susp_a_conf,
    // ── ESTOS FALTABAN ──────────────────────────────
    count_reg_conf: m.Tiempo_Entre_Reg_Confirmacion_count ?? 0,
    count_conf_arm: m.Tiempo_Entre_Confirm_IniArmado_count ?? 0,
    count_arm_cierre: m.Tiempo_Entre_Armado_Cierre_count ?? 0,
    count_susp_conf: m.Tiempo_E_Susp_Confirmacion_count ?? 0,
    // ────────────────────────────────────────────────
    total_tiempo_pag1: reg_a_conf + conf_a_arm + arm_a_cierre,
    total_tiempo_pag2: reg_a_susp + susp_a_conf + conf_a_arm + arm_a_cierre,
  };
}

// ── Page (Server Component) ───────────────────────────────────────────────────
export default async function IndicadoresPage() {
  let data;

  try {
    const res = await fetch(`${API_URL}/indicadores/tiempos`, {
      next: "no-store", 
    });

    if (!res.ok) throw new Error(`API respondió ${res.status}`);

    const api = await res.json();

    const prioridades = (api.prioridades ?? []).map((p: any) => ({
      Prioridad: p.Prioridad,
      cantidad: p.cantidad,
      "Tiempo Promedio": horasAHHMM(p.tiempo_promedio ?? 0),
    }));

    const metricas_mensuales = (api.metricas_mensuales ?? []).map(mapearMes);
    const metricas_por_prioridad = (api.metricas_por_prioridad ?? []).map(
      mapearMes,
    );

    data = { prioridades, metricas_mensuales, metricas_por_prioridad };
  } catch (err) {
    console.error("[IndicadoresPage] Error:", err);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-2xl font-bold text-slate-700">
            Sin datos disponibles
          </p>
          <p className="text-slate-400 text-sm">
            No se pudo conectar con la API.
          </p>
          <p className="text-slate-300 text-xs font-mono">{String(err)}</p>
        </div>
      </div>
    );
  }

  return <IndicadoresDashboard data={data} />;
}

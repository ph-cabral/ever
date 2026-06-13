import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RELOJES = [
  { ip: "10.10.0.12", nombre: "Oficina" },
  { ip: "10.10.0.30", nombre: "Fabrica" },
  { ip: "10.10.0.92", nombre: "Lilser" },
];

const USER = process.env.HIKVISION_USER ?? "admin";
// Sin default hardcodeado: la credencial tiene que venir del entorno.
const PASS = process.env.HIKVISION_PASS ?? "";
const AUTH = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

if (!PASS) console.warn("[relojes] HIKVISION_PASS no configurada — las llamadas a los relojes van a fallar");

async function fetchEmpleadosReloj(ip: string): Promise<{
  ip: string;
  empleados: any[];
  error?: string;
}> {
  const empleados: any[] = [];
  let position = 0;
  const PAGE = 30;
  const MAX_PAGES = 1000; // tope anti-loop si el firmware pagina mal

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = {
        UserInfoSearchCond: {
          searchID: "1",
          searchResultPosition: position,
          maxResults: PAGE,
        },
      };

      const res = await fetch(
        `http://${ip}/ISAPI/AccessControl/UserInfo/Search?format=json`,
        {
          method: "POST",
          headers: {
            Authorization: AUTH,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        return { ip, empleados, error: `HTTP ${res.status}: ${txt}` };
      }

      const data = await res.json();
      const result = data?.UserInfoSearch;

      if (!result) return { ip, empleados, error: "Respuesta inesperada" };
      if (result.responseStatusStrg === "NO MATCH") break;

      const lista = result.UserInfo ?? [];
      empleados.push(...lista);

      if (empleados.length >= (result.numOfMatches ?? 0)) break;
      position += PAGE;
    }

    return { ip, empleados };
  } catch (e: any) {
    return { ip, empleados, error: e?.message ?? "Error de conexión" };
  }
}

// GET /api/rrhh/relojes/empleados?ip=10.10.0.12   (un reloj)
// GET /api/rrhh/relojes/empleados                  (todos)
export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get("ip");
  const targets = ip ? RELOJES.filter((r) => r.ip === ip) : RELOJES;

  const results = await Promise.all(targets.map((r) => fetchEmpleadosReloj(r.ip)));

  // Merge deduplicado por employeeNo, con info de qué relojes tiene
  const mapa = new Map<
    string,
    { empleado: any; relojes: string[]; errores: string[] }
  >();

  for (const { ip, empleados, error } of results) {
    const relojNombre =
      RELOJES.find((r) => r.ip === ip)?.nombre ?? ip;

    if (error) {
      // Incluir el error en el response pero no romper todo
      if (!mapa.has(`__error__${ip}`)) {
        mapa.set(`__error__${ip}`, {
          empleado: null,
          relojes: [],
          errores: [`${relojNombre}: ${error}`],
        });
      }
      continue;
    }

    for (const emp of empleados) {
      const key = emp.employeeNo;
      if (!mapa.has(key)) {
        mapa.set(key, { empleado: emp, relojes: [relojNombre], errores: [] });
      } else {
        mapa.get(key)!.relojes.push(relojNombre);
      }
    }
  }

  const errores: string[] = [];
  const empleados: any[] = [];

  for (const [key, val] of mapa.entries()) {
    if (key.startsWith("__error__")) {
      errores.push(...val.errores);
    } else {
      empleados.push({ ...val.empleado, relojes: val.relojes });
    }
  }

  empleados.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "es"));

  return NextResponse.json({ empleados, errores, total: empleados.length });
}

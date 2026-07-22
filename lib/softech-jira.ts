// Integración con el portal de soporte de Softech (Jira Service Management).
// Al crear una tarjeta en el tablero "softech" se abre automáticamente el caso
// correspondiente en https://softech-ti.atlassian.net/servicedesk/customer/portal/3
// y se guarda el link en la tarjeta (campos.jiraKey / campos.jiraUrl).
//
// Requiere las variables de entorno SOFTECH_JIRA_EMAIL y SOFTECH_JIRA_API_TOKEN
// (cuenta con acceso de cliente a ese portal). Si faltan, o si la llamada falla,
// no se debe romper la creación de la tarjeta: se loguea y se sigue sin link.

const SOFTECH_BASE_URL = "https://softech-ti.atlassian.net";
const SOFTECH_SERVICE_DESK_ID = "3";

// requestTypeId de cada producto, tomados de las URLs de "Solicitar Soporte" del
// portal (…/portal/3/group/11/create/<id>).
export const SOFTECH_REQUEST_TYPE_BY_SISTEMA: Record<string, string> = {
  WMS: "110",
  Magnus: "82",
  Prolixus: "84",
  ecommerce: "83",
  SITD: "85",
};

export type SoftechCaso = { issueKey: string; url: string };

/**
 * Crea un caso ("customer request") en el portal de soporte de Softech.
 * Devuelve null (sin lanzar) si faltan credenciales, el sistema no mapea a un
 * requestTypeId conocido, o la API falla — la tarjeta se crea igual.
 */
export async function crearCasoSoftech(params: {
  sistema?: string | null;
  resumen?: string | null;
  descripcion?: string | null;
}): Promise<SoftechCaso | null> {
  const { sistema, resumen, descripcion } = params;

  const requestTypeId = sistema ? SOFTECH_REQUEST_TYPE_BY_SISTEMA[sistema] : undefined;
  if (!requestTypeId) return null;

  const email = process.env.SOFTECH_JIRA_EMAIL;
  const token = process.env.SOFTECH_JIRA_API_TOKEN;
  if (!email || !token) {
    console.warn(
      "crearCasoSoftech: faltan SOFTECH_JIRA_EMAIL / SOFTECH_JIRA_API_TOKEN, no se crea el caso",
    );
    return null;
  }

  const summary = (resumen ?? "").trim() || "(sin descripción)";

  try {
    const res = await fetch(`${SOFTECH_BASE_URL}/rest/servicedeskapi/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
      },
      body: JSON.stringify({
        serviceDeskId: SOFTECH_SERVICE_DESK_ID,
        requestTypeId,
        requestFieldValues: {
          summary,
          ...(descripcion && descripcion.trim() ? { description: descripcion.trim() } : {}),
        },
      }),
    });

    if (!res.ok) {
      console.error("crearCasoSoftech: respuesta no OK", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const issueKey: string | undefined = data.issueKey;
    if (!issueKey) return null;

    return {
      issueKey,
      url: `${SOFTECH_BASE_URL}/servicedesk/customer/portal/${SOFTECH_SERVICE_DESK_ID}/${issueKey}`,
    };
  } catch (error) {
    console.error("crearCasoSoftech: error de red", error);
    return null;
  }
}

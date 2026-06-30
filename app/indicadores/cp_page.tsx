import fs from "fs"
import path from "path"
import { IndicadoresDashboard } from "./IndicadoresDashboard"

export default function IndicadoresPage() {
  const jsonPath = path.join(process.cwd(), "app/indicadores/datos_dashboard.json")
  const raw = fs.readFileSync(jsonPath, "utf-8")
  const data = JSON.parse(raw)

  return <IndicadoresDashboard data={data} />
}

import { listModels } from "./actions";
import DbAdmin from "./DbAdmin";

export const dynamic = "force-dynamic";

export default async function Page() {
  const models = await listModels();
  return <DbAdmin models={models} />;
}

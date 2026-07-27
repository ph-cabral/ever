import type { Metadata } from "next";
import SistemaClient from "./SistemaClient";

export const metadata: Metadata = { title: "Sistema" };

export default function SistemaPage() {
  return <SistemaClient />;
}

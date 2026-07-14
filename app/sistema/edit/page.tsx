import type { Metadata } from "next";
import SistemaEditClient from "./SistemaEditClient";

export const metadata: Metadata = { title: "Sistema — Vista tabla — EverWear" };

export default function SistemaEditPage() {
  return <SistemaEditClient />;
}

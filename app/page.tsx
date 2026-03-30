import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-8">
      <h1 className="text-white text-3xl font-bold tracking-tight">
        EverWear - Sistema interno
      </h1>
      <div className="flex gap-6">
        <Link
          href="/manguera"
          className="px-8 py-6 bg-orange-600 hover:bg-orange-500 text-white text-xl font-semibold rounded-2xl transition-colors"
        >
          Mangueras
        </Link>
        <Link
          href="/indicadores"
          className="px-8 py-6 bg-blue-700 hover:bg-blue-600 text-white text-xl font-semibold rounded-2xl transition-colors"
        >
          Indicadores
        </Link>
      </div>
    </div>
  );
}

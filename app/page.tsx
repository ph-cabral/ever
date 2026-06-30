import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { MODULES } from "@/lib/auth/modules";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");

  const visibles = MODULES.filter((m) => s.rol === "ADMIN" || s.mods.includes(m.key));

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="flex items-center gap-3 px-5 py-3">
        <span className="text-white/90 text-sm font-medium">{s.nombre}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
          {s.rol === "ADMIN" ? "Administrador" : "Usuario"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {s.rol === "ADMIN" && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <ShieldCheck className="size-4" /> Administración
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4 pb-16">
        <h1 className="text-white text-3xl font-bold tracking-tight text-center">
          EverWear · Sistema interno
        </h1>

        {visibles.length === 0 ? (
          <p className="text-white/60 text-center max-w-sm">
            Todavía no tenés módulos habilitados. Pedile a un administrador que configure los
            permisos de tu sector.
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-5 max-w-3xl">
            {visibles.map((m) => (
              <div key={m.key} className="flex w-56 flex-col items-stretch gap-2">
                <Link
                  href={m.href}
                  className={`px-8 py-6 ${m.color} text-center text-white text-xl font-semibold rounded-2xl transition-colors`}
                >
                  {m.label}
                </Link>
                {m.children?.length ? (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {m.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className="rounded-lg bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

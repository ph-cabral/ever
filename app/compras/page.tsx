import Link from "next/link";
import { PackageX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const accesos = [
  {
    href: "/compras/faltantes",
    icon: PackageX,
    title: "Faltantes",
    desc: "Faltantes de consumo y órdenes de compra.",
  },
];

export default function ComprasHomePage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-medium">Compras</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Accesos rápidos a las gestiones del área.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {accesos.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <CardTitle className="text-base font-medium">{title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{desc}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

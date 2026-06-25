import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CrearUsuarioForm } from "@/components/auth/CrearUsuarioForm";

export const dynamic = "force-dynamic";

export default function NuevoUsuarioPage() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Nuevo usuario</CardTitle>
        <CardDescription>
          Buscá el legajo por DNI, confirmá el nombre y asigná una contraseña.
          Los permisos salen del sector del legajo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CrearUsuarioForm mode="admin" />
      </CardContent>
    </Card>
  );
}

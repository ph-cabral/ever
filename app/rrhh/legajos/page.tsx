"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { InicioButton } from "@/components/ui/InicioButton";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

type Legajo = {
  id: number;
  codigo: string;
  nombre: string;
  sector: string | null;
};

type ApiResp = {
  items: Legajo[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZE = 20;

export default function LegajosListPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-6 py-8 text-sm text-muted-foreground">
          Cargando…
        </div>
      }
    >
      <LegajosContent />
    </Suspense>
  );
}

function LegajosContent() {
  const router = useRouter();
  const sp = useSearchParams();

  const initialSearch = sp.get("search") ?? "";
  const initialPage = parseInt(sp.get("page") ?? "1", 10);

  const [search, setSearch] = useState(initialSearch);
  const [debounced, setDebounced] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounce búsqueda 350ms y resetear a página 1
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Sincronizar URL (?search=&page=)
  useEffect(() => {
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (page > 1) params.set("page", String(page));
    router.replace(`/rrhh/legajos${params.toString() ? `?${params}` : ""}`);
  }, [debounced, page, router]);

  // Fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debounced) params.set("search", debounced);
      const res = await fetch(`/api/rrhh/legajos?${params}`);
      const json: ApiResp = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [page, debounced]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <InicioButton label="Inicio" iconSize={16} className="text-sm text-muted-foreground hover:text-foreground transition-colors" />
        <UsuarioActual className="text-muted-foreground" />
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium">Legajos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString("es-AR")} legajos en el sistema.
          </p>
        </div>
        <Link href="/rrhh/legajos/nuevo">
          <ChevronLeft className="h-4 w-5 mr-2" />
          Nuevo legajo
        </Link>
      </div>

      {/* Buscador */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, sector, DNI o legajo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabla */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Legajo</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Sector</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!loading && data?.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              data?.items.map((l) => (
                <TableRow key={l.id} className="cursor-pointer">
                  <TableCell className="font-mono text-xs">
                    <Link href={`/rrhh/legajos/${l.id}`} className="block">
                      {l.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/rrhh/legajos/${l.id}`} className="block">
                      {l.nombre}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.sector ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-muted-foreground">
          {total > 0
            ? `Mostrando ${from}–${to} de ${total.toLocaleString("es-AR")}`
            : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}


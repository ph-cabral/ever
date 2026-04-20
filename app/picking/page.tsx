"use client";

import { useEffect, useState, useRef } from "react";

type Evento = {
  id: number;
  codigo: string;
  cantidad: number;
  picker_nombre: string;
  estado: string;
  creado_en: string;
};
type ChatMensaje = {
  id: number;
  picker_nombre: string;
  mensaje: string;
  creado_en: string;
};

export default function PickingPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [mensajes, setMensajes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  
  const [chatMensajes, setChatMensajes] = useState<ChatMensaje[]>([]);

  const [mensajeSeleccionado, setMensajeSeleccionado] = useState<number | null>(
    null,
  );
  const [respuesta, setRespuesta] = useState("");
  const respuestaRef = useRef<HTMLInputElement>(null);


  const responderChat = async (id: number) => {
    if (!respuesta.trim()) return;
    await fetch(`/api/chat/${id}/responder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ respuesta }),
    });
    setMensajeSeleccionado(null);
    setRespuesta("");
    fetchChat();
  };


  const fetchChat = async () => {
    const res = await fetch("/api/chat");
    if (res.ok) setChatMensajes(await res.json());
  };

  const fetchEventos = async () => {
    const res = await fetch("/api/picking/eventos?estado=pendiente");
    if (res.ok) {
      const data = await res.json();
      setEventos(data);
    }
  };

  useEffect(() => {
    fetchEventos();
    fetchChat();
    const interval = setInterval(() => {
      fetchEventos();
      fetchChat();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const responder = async (id: number, estado: "pedido" | "s/e") => {
    setLoading((prev) => ({ ...prev, [id]: true }));
    await fetch(`/api/picking/eventos/${id}/responder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado, respuesta_nota: mensajes[id] ?? "" }),
    });
    setLoading((prev) => ({ ...prev, [id]: false }));
    setMensajes((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    fetchEventos();
  };

  return (
    <div className="h-screen bg-gray-950 text-white p-6 flex flex-col overflow-hidden">
      <h1 className="text-2xl font-bold mb-6 shrink-0">
        Deposito - Pedidos pendientes
      </h1>

      {/* Layout principal */}
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Tabla: scroll propio si es larga */}
        <div className="flex-1 overflow-auto">
          {eventos.length === 0 ? (
            <p className="text-gray-400">Sin pedidos pendientes</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2 px-4">Codigo</th>
                    <th className="text-left py-2 px-4">Cantidad</th>
                    <th className="text-left py-2 px-4">Picker</th>
                    <th className="text-left py-2 px-4">Hora</th>
                    <th className="text-left py-2 px-4">Nota</th>
                    <th className="text-left py-2 px-4">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-gray-800 hover:bg-gray-900"
                    >
                      <td className="py-3 px-4 font-mono font-bold">
                        {e.codigo}
                      </td>
                      <td className="py-3 px-4">{e.cantidad}</td>
                      <td className="py-3 px-4">{e.picker_nombre}</td>
                      <td className="py-3 px-4 text-gray-400 text-xs">
                        {new Date(e.creado_en).toLocaleTimeString("es-AR")}
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          placeholder="Nota opcional..."
                          value={mensajes[e.id] ?? ""}
                          onChange={(ev) =>
                            setMensajes((prev) => ({
                              ...prev,
                              [e.id]: ev.target.value,
                            }))
                          }
                          className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm w-full focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => responder(e.id, "pedido")}
                            disabled={loading[e.id]}
                            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded transition-colors"
                          >
                            Pedido
                          </button>
                          <button
                            onClick={() => responder(e.id, "s/e")}
                            disabled={loading[e.id]}
                            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded transition-colors"
                          >
                            S/E
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar: altura controlada con scroll interno */}
        <div className="w-80 bg-gray-900 rounded-xl p-4 flex flex-col gap-3 h-full">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide shrink-0">
            💬 Consultas ({chatMensajes.length})
          </h2>

          {/* Área mensajes: flex-1 + overflow-y-auto +q   min-h-0 = scroll funcional */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0 scrollbar-hide">
            {chatMensajes.length === 0 && (
              <p className="text-gray-500 text-sm">Sin consultas</p>
            )}
            {chatMensajes.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  setMensajeSeleccionado(m.id);
                  setRespuesta("");
                  setTimeout(() => respuestaRef.current?.focus(), 50);
                }}
                className={`rounded-2xl p-3 cursor-pointer transition-colors ${
                  mensajeSeleccionado === m.id
                    ? "bg-blue-700"
                    : "bg-gray-800 hover:bg-gray-700"
                }`}
              >
                <p className="text-blue-300 text-xs font-bold mb-1">
                  {m.picker_nombre}
                </p>
                <p className="text-white text-sm">{m.mensaje}</p>
                <p className="text-gray-500 text-xs mt-1">
                  {new Date(m.creado_en).toLocaleTimeString("es-AR")}
                </p>
              </div>
            ))}
          </div>

          {/* Input: shrink-0 para que no desaparezca */}
          {mensajeSeleccionado !== null && (
            <div className="flex gap-2 mt-2 shrink-0">
              <input
                ref={respuestaRef}
                type="text"
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && responderChat(mensajeSeleccionado)
                }
                placeholder="Responder..."
                className="flex-1 bg-gray-800 border border-blue-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              />
              <button
                onClick={() => responderChat(mensajeSeleccionado)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded-lg text-sm font-bold"
              >
                ↵
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

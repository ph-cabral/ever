"use client";

import { useEffect, useState, useRef } from "react";

export default function PickerPage() {
  const [pickerNombre, setPickerNombre] = useState<string | null>(null);
  const [nombreInput, setNombreInput] = useState("");
  const [codigo, setCodigo] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [feedback, setFeedback] = useState<{
    tipo: "ok" | "error";
    mensaje: string;
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const codigoRef = useRef<HTMLInputElement>(null);
  const [chatAbierto, setChatAbierto] = useState(false);
  const [mensajeChat, setMensajeChat] = useState("");
  const [enviandoChat, setEnviandoChat] = useState(false);
  const chatRef = useRef<HTMLTextAreaElement>(null);


  const enviarChat = async () => {
    if (!mensajeChat.trim() || !pickerNombre) return;
    setEnviandoChat(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picker_nombre: pickerNombre,
          mensaje: mensajeChat.trim(),
        }),
      });
      if (res.ok) {
        setMensajeChat("");
        setChatAbierto(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEnviandoChat(false);
    }
  };

  useEffect(() => {
    const nombre = localStorage.getItem("picker_nombre");
    if (nombre) setPickerNombre(nombre);
  }, []);

  const cantidadRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardarNombre = () => {
    const n = nombreInput.trim();
    if (!n) return;
    localStorage.setItem("picker_nombre", n);
    setPickerNombre(n);
  };

  const enviar = async () => {
    if (!codigo.trim() || !cantidad.trim()) return;
    setEnviando(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/picking/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: codigo.trim().toUpperCase(),
          cantidad: Number(cantidad),
          picker_nombre: pickerNombre,
        }),
      });
      if (res.ok) {
        setFeedback({ tipo: "ok", mensaje: "✅ Pedido enviado" });
        setCodigo("");
        setCantidad("");
        codigoRef.current?.focus();
      } else {
        setFeedback({ tipo: "error", mensaje: "❌ Error al enviar" });
      }
    } catch {
      setFeedback({ tipo: "error", mensaje: "❌ Sin conexión" });
    } finally {
      setEnviando(false);
    }
  };

  const topic = `everwear-picking-${pickerNombre?.toLowerCase().replace(/\s+/g, "-")}`;

  function handleCodigoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCodigo(e.target.value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (e.target.value.trim() !== "") {
        cantidadRef.current?.focus();
      }
    }, 300);
  }

  // Pantalla ingreso nombre
  if (!pickerNombre) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">EverWear Picking</h1>
            <p className="text-gray-400 mt-2">¿Cómo te llamás?</p>
          </div>
          <input
            type="text"
            placeholder="Tu nombre"
            value={nombreInput}
            onChange={(e) => setNombreInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardarNombre()}
            autoFocus
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={guardarNombre}
            disabled={!nombreInput.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-4 rounded-xl text-lg transition-colors"
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  // Pantalla principal
  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-8 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold">Picking</h1>
          <p className="text-gray-400 text-sm">{pickerNombre}</p>
        </div>

        <button
          onClick={() => setChatAbierto(true)}
          className="mt-1 w-55 h-9 bg-green-400 hover:bg-blue-600 text-white font-semibold py-1 rounded-lg"
        >
          💬 Consulta al depósito
        </button>
        <button
          onClick={() => {
            localStorage.removeItem("picker_nombre");
            setPickerNombre(null);
          }}
          className="text-xs text-gray-500 hover:text-gray-300 underline"
        >
          Cambiar nombre
        </button>
      </div>

      {/* Modal */}
      {chatAbierto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-white font-bold text-lg">
              Consulta al depósito
            </h2>
            <button
              onClick={() => setChatAbierto(false)}
              className="text-gray-400 text-2xl"
            >
              ✕
            </button>
          </div>
          <textarea
            ref={chatRef}
            autoFocus
            value={mensajeChat}
            onChange={(e) => setMensajeChat(e.target.value)}
            placeholder="Escribí tu consulta..."
            className="flex-1 bg-gray-800 text-white rounded-xl p-4 resize-none text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={enviarChat}
            disabled={enviandoChat || !mensajeChat.trim()}
            className="mt-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-4 rounded-xl text-lg"
          >
            Enviar
          </button>
        </div>
      )}

      {/* Formulario */}
      <div className="space-y-4 flex-1">
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
            Código de producto
          </label>
          <input
            ref={codigoRef}
            type="text"
            placeholder="Ej: ABC-123"
            value={codigo}
            onChange={handleCodigoChange}
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-white text-lg font-mono focus:outline-none focus:border-blue-500"
            autoCapitalize="characters"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
            Cantidad
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={cantidad}
            ref={cantidadRef}
            onChange={(e) => setCantidad(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={enviar}
          disabled={enviando || !codigo.trim() || !cantidad.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-5 rounded-xl text-lg transition-colors"
        >
          {enviando ? "Enviando..." : "Enviar pedido"}
        </button>
        {/* Feedback */}
        <hr />
        {feedback && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              feedback.tipo === "ok"
                ? "bg-green-900 text-green-300 border border-green-700"
                : "bg-red-900 text-red-300 border border-red-700"
            }`}
          >
            {feedback.mensaje}
          </div>
        )}
      </div>

      {/* Bloque ntfy
      <div className="mt-8 bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-2">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
          Notificaciones
        </p>
        <p className="text-sm text-gray-300">
          Instalá{" "}
          <a
            href="https://ntfy.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline"
          >
            ntfy
          </a>{" "}
          en tu cel y suscribite a:
        </p>
        <div className="bg-gray-800 rounded-lg px-4 py-2 font-mono text-sm text-green-400 break-all">
          {topic}
        </div>
        <p className="text-xs text-gray-500">
          Cuando depósito responda, te llega una notificación.
        </p>
      </div> */}
    </div>
  );
}

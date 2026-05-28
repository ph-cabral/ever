"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Msg = { role: "user" | "assistant"; content: string };

const USER_ID = "1";
const SESSION_ID = `user_${USER_ID}`;

const GENEROS = [
  { label: "Masculino", value: "male" },
  { label: "Femenino", value: "female" },
];
const UBICACIONES = [
  { label: "Fábrica", value: "Fabrica" },
  { label: "Lilser", value: "Lilser" },
  { label: "Oficina", value: "Oficina" },
];

// Detecta si el último mensaje del asistente abrió el flujo de creación
function isAwaitingEmployeeData(messages: Msg[]) {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (!last) return false;
  return /Foto tomada/i.test(last.content);
}


function renderContent(text: string, onCancel?: () => void) {
  const imgRegex = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
  const parts: Array<{ t: "text" | "img"; v: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = imgRegex.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "text", v: text.slice(last, m.index) });
    parts.push({ t: "img", v: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", v: text.slice(last) });

  return parts.map((p, i) =>
    p.t === "img" ? (
      <div key={i} className="my-2 flex items-start gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.v}
          alt="foto"
          className="rounded-lg max-w-xs border border-zinc-700"
        />
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-md bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs text-white"
          >
            Cancelar
          </button>
        )}
      </div>
    ) : (
      <span key={i} className="whitespace-pre-wrap break-all">
        {p.v.replace("[LOC_PICK]", "")}
      </span>
    ),
  );
}




export default function VickiPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [gender, setGender] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  

  // Cargar historial
  useEffect(() => {
    (async () => {
      try {
        fetch("/api/vicki/history/user_1")
          .then((r) => r.json())
          .then(console.log);
        const r = await fetch(`/api/vicki/history/${SESSION_ID}`);
        if (!r.ok) return;
        const data = await r.json();
        const map: Record<string, "user" | "assistant"> = {
          human: "user",
          ai: "assistant",
        };
        const hist: Msg[] = (data.history ?? []).map((m: any) => ({
          role: map[m.role] ?? m.role,
          content: m.content,
        }));
        setMessages(hist);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const [awaitingEmp, setAwaitingEmp] = useState(false);

  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    setPickingLocation(!!last && /\[LOC_PICK\]/.test(last.content));
    fetch(`/api/vicki/draft_status/${SESSION_ID}`)
      .then((r) => r.json())
      .then((d) => setAwaitingEmp(!!d.has_draft));
  }, [messages]);

  const inputLocked = awaitingEmp && (!gender || !location);
  const placeholder = awaitingEmp
    ? !gender || !location
      ? "Seleccioná sexo y ubicación primero"
      : "Nombre y apellido del empleado…"
    : "Escribí tu mensaje… (ej: /crea empleado)";

  async function send(message: string) {
    if (!message.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: message };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const payload: any = {
      message,
      session_id: SESSION_ID,
      user_id: USER_ID,
    };
    if (awaitingEmp && gender && location) {
      payload.gender = gender;
      payload.location = location;
    }

    try {
      const r = await fetch("/api/vicki/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      const answer = data.response ?? `Error: ${data.error ?? "desconocido"}`;
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);

      if (/Empleado \*\*\d+\*\*/.test(answer) || answer.startsWith("✅")) {
        setGender("");
        setLocation("");
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error de conexión: ${e?.message ?? e}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function cancelEmployee() {
    try {
      await fetch(`/api/vicki/cancel_employee/${SESSION_ID}`, {
        method: "POST",
      });
    } catch {}
    setGender("");
    setLocation("");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "❌ Operación cancelada." },
    ]);
  }


  async function pickLocation(loc: string) {
    setLoading(true);
    try {
      const r = await fetch("/api/vicki/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: loc,
          session_id: SESSION_ID,
          user_id: USER_ID,
          location: loc,
        }),
      });
      const data = await r.json();
      setMessages((prev) => [
        ...prev,
        { role: "user", content: `📍 ${loc}` },
        { role: "assistant", content: data.response },
      ]);
      setLocation(loc);
    } finally {
      setLoading(false);
    }
  }


  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }


  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Vicki — Selección de Personal</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="text-zinc-500 text-sm text-center py-12">
              Escribí{" "}
              <code className="bg-zinc-800 px-1.5 py-0.5 rounded">
                /crea empleado
              </code>{" "}
              para empezar.
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                // className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm overflow-hidden break-words ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {/* {renderContent(m.content)}
                 */}
                {renderContent(
                  m.content,
                  awaitingEmp &&
                    m.role === "assistant" &&
                    i === messages.length - 1
                    ? cancelEmployee
                    : undefined,
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 text-zinc-400 rounded-2xl px-4 py-2.5 text-sm">
                Pensando…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 py-4">
        <form
          onSubmit={onSubmit}
          className="mx-auto max-w-2xl flex flex-col gap-2"
        >
          {pickingLocation && (
            <div className="flex gap-2">
              {UBICACIONES.map((u) => (
                <Button
                  key={u.value}
                  type="button"
                  onClick={() => pickLocation(u.value)}
                  disabled={loading}
                  className="flex-1"
                >
                  {u.label}
                </Button>
              ))}
            </div>
          )}
          {awaitingEmp && (
            <div className="flex gap-2">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Sexo…</option>
                {GENEROS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Ubicación…</option>
                {UBICACIONES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={inputLocked || loading}
              className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
            <Button
              type="submit"
              disabled={inputLocked || loading || !input.trim()}
            >
              Enviar
            </Button>
          </div>
        </form>
      </footer>
    </div>
  );
}

"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./armar.module.css";

type Prz = { file: string; nombre: string; cantidad?: number };
type Inst = { premios: Prz[] };
const qty = (p: Prz) => Math.max(1, p.cantidad ?? 1);

const MAX = 10;
const urlOf = (f: string) => `/premios/${encodeURIComponent(f)}`;
const MEDALLAS = ["🥇", "🥈", "🥉"];
const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = "hidden";
};

export default function ArmarClient() {
  const [paletaAll, setPaletaAll] = useState<Prz[]>([]);
  const [instancias, setInstancias] = useState<Inst[]>([]);
  const [locked, setLocked] = useState(false);
  const [ganadores, setGanadores] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [target, setTarget] = useState(0); // instancia destino para click-to-add

  const drag = useRef<{ file: string; nombre: string; cantidad?: number; from: number | "paleta" } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pr, rd] = await Promise.all([
          fetch("/api/sorteo/premios").then((r) => r.json()),
          fetch("/api/sorteo/ronda").then((r) => r.json()),
        ]);
        if (Array.isArray(pr?.premios))
          setPaletaAll(pr.premios.map((p: Prz) => ({ file: p.file, nombre: p.nombre })));
        const insts = Array.isArray(rd?.ronda?.instancias) ? rd.ronda.instancias : [];
        setInstancias(
          insts.map((i: { premios?: Prz[] }) => ({
            premios: Array.isArray(i?.premios)
              ? i.premios.map((p) => ({ file: p.file, nombre: p.nombre, cantidad: qty(p) }))
              : [],
          })),
        );
        const album = Array.isArray(rd?.album) ? rd.album : [];
        setGanadores(album.length);
        setLocked(album.length > 0);
      } catch {
        setMsg("No se pudo cargar.");
      }
      setCargando(false);
    })();
  }, []);

  const colocados = useMemo(
    () => new Set(instancias.flatMap((i) => i.premios.map((p) => p.file))),
    [instancias],
  );
  const paleta = useMemo(
    () => paletaAll.filter((p) => !colocados.has(p.file)),
    [paletaAll, colocados],
  );
  // total = unidades (suma de cantidades), no cantidad de imágenes
  const total = useMemo(
    () => instancias.reduce((s, i) => s + i.premios.reduce((a, p) => a + qty(p), 0), 0),
    [instancias],
  );

  // ---- mutaciones ----
  const colocarEn = (idx: number, prz: Prz, from: number | "paleta") => {
    if (from === "paleta" && total >= MAX) {
      setMsg(`Tope de ${MAX} premios.`);
      return;
    }
    setInstancias((prev) => {
      const next = prev.map((i) => ({ premios: [...i.premios] }));
      if (typeof from === "number" && next[from])
        next[from].premios = next[from].premios.filter((p) => p.file !== prz.file);
      if (next[idx] && !next[idx].premios.some((p) => p.file === prz.file))
        next[idx].premios.push({ file: prz.file, nombre: prz.nombre, cantidad: qty(prz) });
      return next;
    });
    setMsg("");
  };

  const setCantidad = (idx: number, pos: number, val: number) => {
    setInstancias((prev) => {
      const next = prev.map((i) => ({ premios: i.premios.map((p) => ({ ...p })) }));
      const fila = next[idx]?.premios[pos];
      if (!fila) return prev;
      const otros = next.reduce(
        (s, inst, k) => s + inst.premios.reduce((a, p, j) => a + (k === idx && j === pos ? 0 : qty(p)), 0),
        0,
      );
      let v = Math.max(1, Math.floor(val || 1));
      if (otros + v > MAX) v = MAX - otros; // clamp al tope de 10
      fila.cantidad = Math.max(1, v);
      return next;
    });
    setMsg("");
  };

  const quitarDeInst = (idx: number, file: string) =>
    setInstancias((prev) => {
      const next = prev.map((i) => ({ premios: [...i.premios] }));
      if (next[idx]) next[idx].premios = next[idx].premios.filter((p) => p.file !== file);
      return next;
    });

  const moverPremio = (idx: number, pos: number, dir: -1 | 1) =>
    setInstancias((prev) => {
      const next = prev.map((i) => ({ premios: [...i.premios] }));
      const arr = next[idx]?.premios;
      const j = pos + dir;
      if (arr && j >= 0 && j < arr.length) [arr[pos], arr[j]] = [arr[j], arr[pos]];
      return next;
    });

  const moverInstancia = (idx: number, dir: -1 | 1) =>
    setInstancias((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j >= 0 && j < next.length) [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const agregarInstancia = () => {
    setInstancias((prev) => [...prev, { premios: [] }]);
    setTarget(instancias.length);
  };

  const quitarInstancia = (idx: number) => {
    setInstancias((prev) => prev.filter((_, i) => i !== idx));
    setTarget(0);
  };

  // ---- guardar / nuevo ----
  const guardar = async () => {
    if (instancias.length === 0) return setMsg("Agregá al menos una instancia.");
    if (instancias.some((i) => i.premios.length === 0))
      return setMsg("Hay instancias vacías: quitalas o agregales premios.");
    setGuardando(true);
    setMsg("");
    try {
      const body = {
        instancias: instancias.map((inst, i) => ({
          orden: i + 1,
          premios: inst.premios.map((p) => ({ file: p.file, nombre: p.nombre, cantidad: qty(p) })),
        })),
      };
      const r = await fetch("/api/sorteo/ronda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setMsg(d.ok ? "✓ Guardado. Ya podés ir al sorteo." : d.msg || "No se pudo guardar.");
      if (!d.ok && r.status === 409) setLocked(true);
    } catch {
      setMsg("Error de conexión.");
    }
    setGuardando(false);
  };

  const nuevoSorteo = async () => {
    const clv = window.prompt("Contraseña para cerrar la ronda actual y empezar otra:");
    if (clv == null) return;
    try {
      const r = await fetch("/api/sorteo/ronda", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "nuevo", clave: clv }),
      });
      const d = await r.json();
      if (d.ok) {
        setInstancias([]);
        setGanadores(0);
        setLocked(false);
        setMsg("Nuevo sorteo creado. Armá los premios.");
      } else window.alert(d.msg || "No autorizado");
    } catch {
      window.alert("Error de conexión");
    }
  };

  if (cargando)
    return (
      <div className={styles.wrap}>
        <div className={styles.cargando}>Cargando…</div>
      </div>
    );

  return (
    <div className={styles.wrap}>
      <header className={styles.top}>
        <Link href="/sorteo" className={styles.volver}>
          ← Sorteo
        </Link>
        <h1 className={styles.titulo}>🎁 Armar premios</h1>
        <span className={styles.contador} data-full={total >= MAX || undefined}>
          {total}/{MAX}
        </span>
      </header>

      {locked && (
        <div className={styles.aviso}>
          Ronda en curso ({ganadores} {ganadores === 1 ? "ganador" : "ganadores"}). Para
          rearmar premios tenés que cerrarla y empezar otra.
          <button className={styles.btnNuevo} onClick={nuevoSorteo}>
            Nuevo sorteo
          </button>
        </div>
      )}

      <div className={styles.cols} data-locked={locked || undefined}>
        {/* PALETA */}
        <section className={styles.paletaCol}>
          <div className={styles.colTit}>Premios disponibles</div>
          <div
            className={styles.paleta}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag.current && typeof drag.current.from === "number")
                quitarDeInst(drag.current.from, drag.current.file);
              drag.current = null;
            }}
          >
            {paleta.length === 0 && (
              <div className={styles.vacio}>
                {paletaAll.length === 0
                  ? "No hay imágenes en /public/premios."
                  : "Todos los premios están asignados."}
              </div>
            )}
            {paleta.map((p) => (
              <div
                key={p.file}
                className={styles.tile}
                draggable={!locked}
                onDragStart={() => (drag.current = { ...p, from: "paleta" })}
                onClick={() => {
                  if (locked) return;
                  if (instancias.length === 0) return setMsg("Agregá una instancia primero.");
                  colocarEn(Math.min(target, instancias.length - 1), p, "paleta");
                }}
                title={`${p.nombre} — clic para agregar a la instancia ${Math.min(target, Math.max(instancias.length, 1))}`}
              >
                <img src={urlOf(p.file)} alt={p.nombre} onError={hideImg} />
                <span>{p.nombre}</span>
              </div>
            ))}
          </div>
        </section>

        {/* INSTANCIAS */}
        <section className={styles.instCol}>
          <div className={styles.colTit}>
            Instancias <small>(orden de tirada · premios de mejor a peor)</small>
          </div>

          {instancias.map((inst, idx) => (
            <div
              key={idx}
              className={styles.inst}
              data-target={target === idx || undefined}
              onClick={() => setTarget(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag.current) colocarEn(idx, drag.current, drag.current.from);
                drag.current = null;
              }}
            >
              <div className={styles.instHead}>
                <strong>Instancia {idx + 1}</strong>
                <span className={styles.instInfo}>
                  {inst.premios.length} {inst.premios.length === 1 ? "premio" : "premios"} ·{" "}
                  {inst.premios.reduce((a, p) => a + qty(p), 0)} giros
                </span>
                <span className={styles.instBtns}>
                  <button onClick={() => moverInstancia(idx, -1)} disabled={idx === 0} title="Subir">
                    ▲
                  </button>
                  <button
                    onClick={() => moverInstancia(idx, 1)}
                    disabled={idx === instancias.length - 1}
                    title="Bajar"
                  >
                    ▼
                  </button>
                  <button className={styles.del} onClick={() => quitarInstancia(idx)} title="Quitar instancia">
                    ✕
                  </button>
                </span>
              </div>

              <div className={styles.instBody}>
                {inst.premios.length === 0 && (
                  <div className={styles.dropHint}>Arrastrá o tocá premios acá</div>
                )}
                {inst.premios.map((p, pos) => (
                  <div
                    key={p.file}
                    className={styles.przRow}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      drag.current = { ...p, from: idx };
                    }}
                  >
                    <span className={styles.puesto}>{MEDALLAS[pos] ?? `${pos + 1}°`}</span>
                    <img src={urlOf(p.file)} alt={p.nombre} onError={hideImg} />
                    <span className={styles.przNom}>{p.nombre}</span>
                    <label className={styles.cant} title="Cantidad de este premio" onClick={(e) => e.stopPropagation()}>
                      ×
                      <input
                        type="number"
                        min={1}
                        value={qty(p)}
                        onChange={(e) => setCantidad(idx, pos, parseInt(e.target.value) || 1)}
                      />
                    </label>
                    <span className={styles.przBtns}>
                      <button onClick={() => moverPremio(idx, pos, -1)} disabled={pos === 0} title="Mejor">
                        ▲
                      </button>
                      <button
                        onClick={() => moverPremio(idx, pos, 1)}
                        disabled={pos === inst.premios.length - 1}
                        title="Peor"
                      >
                        ▼
                      </button>
                      <button className={styles.del} onClick={() => quitarDeInst(idx, p.file)} title="Quitar">
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button className={styles.btnInst} onClick={agregarInstancia} disabled={locked}>
            ＋ Agregar instancia
          </button>
        </section>
      </div>

      <div className={styles.barra}>
        <span className={styles.msg}>{msg}</span>
        <Link href="/sorteo" className={styles.btnSec}>
          Ir al sorteo
        </Link>
        <button className={styles.btnGuardar} onClick={guardar} disabled={guardando || locked}>
          {guardando ? "Guardando…" : "Guardar plan"}
        </button>
      </div>
    </div>
  );
}

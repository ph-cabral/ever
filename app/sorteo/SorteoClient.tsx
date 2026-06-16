"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import styles from "./sorteo.module.css";

type P = { fila: number; dni: string; nombre: string; img?: string };

const NS = "http://www.w3.org/2000/svg";
const COLS = 5;
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function SorteoClient() {
  const [participantes, setParticipantes] = useState<P[]>([]);
  const [cantidad, setCantidad] = useState(3);
  const [corriendo, setCorriendo] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [clave, setClave] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [ganadores, setGanadores] = useState<{ num: number; nombre: string }[]>([]);

  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reelsRef = useRef<HTMLDivElement>(null);
  const lineasRef = useRef<SVGSVGElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const bimgRef = useRef<HTMLImageElement>(null);
  const bnombreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/sorteo/participantes")
      .then((r) => r.json())
      .then((d) => setParticipantes(d.participantes || []))
      .catch(() => {});
  }, []);

  // ---- construcción de rodillos ----
  const makeSym = (p: P, win: boolean) => {
    const d = document.createElement("div");
    d.className = styles.sym;
    if (win) d.setAttribute("data-win", "1");
    const img = document.createElement("img");
    img.src = `/api/foto/${encodeURIComponent(p.dni)}`;
    img.alt = "";
    img.onerror = () => {
      d.classList.add(styles.noimg);
      d.textContent = p.nombre;
    };
    d.appendChild(img);
    return d;
  };

  const buildStrip = (
    el: HTMLDivElement,
    pool: P[],
    ganador: P,
    steps: number,
    esG: boolean,
    filaObj: number
  ) => {
    el.style.transition = "none";
    el.style.transform = "translateY(0)";
    el.innerHTML = "";
    const fin = steps + filaObj;
    const len = steps + 3;
    const fp = pool.length ? pool : [ganador];
    for (let i = 0; i < len; i++) {
      const win = esG && i === fin;
      el.appendChild(makeSym(win ? ganador : fp[Math.floor(Math.random() * fp.length)], win));
    }
  };

  const animar = (el: HTMLDivElement, dist: number, dur: number) =>
    new Promise<void>((res) => {
      const t0 = performance.now();
      const frame = (now: number) => {
        const p = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.style.transform = `translateY(${-dist * e}px)`;
        if (p < 1) requestAnimationFrame(frame);
        else res();
      };
      requestAnimationFrame(frame);
    });

  const tirada = (todos: P[], ganador: P) => {
    limpiarReveal();
    const pool = todos.length > 1 ? todos.filter((p) => p.fila !== ganador.fila) : todos;
    const cols = [0, 1, 2, 3, 4];
    const fuera = cols.splice(Math.floor(Math.random() * COLS), 1)[0]; // 1 columna sin ganador → 4 caras
    return Promise.all(
      stripRefs.current.map((el, c) => {
        if (!el) return Promise.resolve();
        const steps = 10 + c * 3;
        const dur = 1400 + c * 550;
        const esG = c !== fuera;
        const filaObj = Math.floor(Math.random() * 3);
        buildStrip(el, pool, ganador, steps, esG, filaObj);
        const ih = (el.firstChild as HTMLElement)?.offsetHeight || 90;
        return animar(el, steps * ih, dur);
      })
    ).then(() => {});
  };

  // ---- revelar ganador ----
  const dibujarConexion = (wins: NodeListOf<Element>) => {
    const svg = lineasRef.current;
    const reels = reelsRef.current;
    if (!svg || !reels) return;
    const box = reels.getBoundingClientRect();
    svg.setAttribute("width", String(box.width));
    svg.setAttribute("height", String(box.height));
    svg.innerHTML = "";
    const pts = Array.from(wins)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2] as [number, number];
      })
      .sort((a, b) => a[0] - b[0]);
    const poly = document.createElementNS(NS, "polyline") as SVGPolylineElement;
    poly.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
    poly.setAttribute("class", styles.poly);
    svg.appendChild(poly);
    pts.forEach((p) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", String(p[0]));
      c.setAttribute("cy", String(p[1]));
      c.setAttribute("r", "8");
      c.setAttribute("class", styles.dot);
      svg.appendChild(c);
    });
    const len = poly.getTotalLength();
    poly.style.strokeDasharray = String(len);
    poly.style.strokeDashoffset = String(len);
    poly.getBoundingClientRect();
    poly.style.transition = "stroke-dashoffset .7s ease";
    poly.style.strokeDashoffset = "0";
  };

  const jackpot = (g: P, num: number) => {
    const wins = reelsRef.current?.querySelectorAll("[data-win]");
    if (wins) {
      wins.forEach((e) => e.classList.add(styles.win));
      dibujarConexion(wins);
    }
    if (bimgRef.current) {
      bimgRef.current.src = `/api/foto/${encodeURIComponent(g.dni)}`;
      bimgRef.current.style.display = "block";
    }
    if (bnombreRef.current) bnombreRef.current.textContent = g.nombre;
    bannerRef.current?.classList.add(styles.show);
    setGanadores((prev) => [...prev, { num, nombre: g.nombre }]);
    confeti();
  };

  const limpiarReveal = () => {
    if (lineasRef.current) lineasRef.current.innerHTML = "";
    bannerRef.current?.classList.remove(styles.show);
  };

  const confeti = () => {
    const cols = ["#6c5ce7", "#00cec9", "#fd79a8", "#ffd166", "#55efc4", "#74b9ff"];
    for (let i = 0; i < 28; i++) {
      const d = document.createElement("div");
      d.className = styles.confeti;
      d.style.left = Math.random() * 100 + "vw";
      d.style.background = cols[i % cols.length];
      d.style.animationDuration = 1.1 + Math.random() * 1.1 + "s";
      d.style.animationDelay = Math.random() * 0.3 + "s";
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2600);
    }
  };

  // ---- flujo ----
  const correrSecuencia = async (todos: P[], gs: P[], real: boolean, clv: string) => {
    setCorriendo(true);
    setGanadores([]);
    limpiarReveal();
    for (let i = 0; i < gs.length; i++) {
      await tirada(todos, gs[i]);
      jackpot(gs[i], i + 1);
      if (real) {
        fetch("/api/sorteo/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fila: gs[i].fila, clave: clv }),
        }).catch(() => {});
      }
      await esperar(2000);
      limpiarReveal();
      await esperar(250);
    }
    setCorriendo(false);
  };

  const iniciar = () => {
    if (corriendo) return;
    setClave("");
    setModalMsg("");
    setModalOpen(true);
  };

  const ejecutar = async (modo: "prueba" | "real") => {
    const n = cantidad || 1;
    try {
      const r = await fetch("/api/sorteo/sortear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, n, clave }),
      });
      const d = await r.json();
      if (!d.ok) {
        setModalMsg(d.msg || "Error");
        return;
      }
      if (!d.ganadores?.length) {
        setModalMsg("Sin participantes");
        return;
      }
      setModalOpen(false);
      setModalMsg("");
      await correrSecuencia(d.todos as P[], d.ganadores as P[], modo === "real", clave);
    } catch {
      setModalMsg("Error de conexión");
    }
  };

  return (
    <div className={styles.wrap}>
      <h1 style={{ fontWeight: 700, fontSize: 26 }}>🎰 Sorteo EverWear</h1>
      <div className={styles.count}>{participantes.length} participantes registrados</div>

      <div className={styles.machine}>
        <div ref={reelsRef} className={styles.reels}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.reel}>
              <div
                ref={(el) => {
                  stripRefs.current[i] = el;
                }}
                className={styles.strip}
              />
            </div>
          ))}
          <svg ref={lineasRef} className={styles.lineas} />
        </div>
      </div>

      <div ref={bannerRef} className={styles.banner}>
        <small>GANADOR</small>
        <img
          ref={bimgRef}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div ref={bnombreRef} className={styles.nom} />
      </div>

      <div className={styles.controles}>
        <input
          className={styles.cantidad}
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
        />
        <button className={styles.principal} onClick={iniciar} disabled={corriendo}>
          Girar
        </button>
      </div>

      <div className={styles.lista}>
        {ganadores.map((g) => (
          <span key={g.num} className={styles.chip}>
            <b>#{g.num}</b>
            {g.nombre}
          </span>
        ))}
      </div>

      {modalOpen && (
        <div className={styles.modal} onClick={() => setModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3>Contraseña</h3>
            <input
              type="password"
              placeholder="Contraseña"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
            <div className={styles.modalMsg}>{modalMsg}</div>
            <div className={styles.modalBtns}>
              <button className={styles.btnSec} onClick={() => ejecutar("prueba")}>
                Probar
              </button>
              <button className={styles.principal} onClick={() => ejecutar("real")}>
                Aceptar
              </button>
            </div>
            <button className={styles.cerrar} onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

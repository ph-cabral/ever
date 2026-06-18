"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import styles from "./sorteo.module.css";

type P = { fila: number; dni: string; nombre: string; img?: string };
type Carta = P & { rank: number };

const NS = "http://www.w3.org/2000/svg";
const COLS = 5;
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// IMPORTANTE: messi.png debe ser RECORTADO con fondo TRANSPARENTE (solo el cuerpo).
// Guardalo en /public/sorteo/messi.png.
const CARTA = "/sorteo/messi.png";

// Fondo segun puesto: 1=oro, 2=plata, 3=bronce, resto=celeste.
const fondoFor = (i: number) =>
  i === 0
    ? "radial-gradient(circle at 50% 35%, #fff3b0, #e7c34b 55%, #9a7a1e)"
    : i === 1
      ? "radial-gradient(circle at 50% 35%, #ffffff, #d2d2d2 55%, #7d7d7d)"
      : i === 2
        ? "radial-gradient(circle at 50% 35%, #f3c690, #cd7f32 55%, #7a4a1d)"
        : "radial-gradient(circle at 50% 35%, #d9f0ff, #75aadb 55%, #2d7fb8)";

export default function SorteoClient() {
  const [participantes, setParticipantes] = useState<P[]>([]);
  const [cantidad, setCantidad] = useState(3);
  const [corriendo, setCorriendo] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [clave, setClave] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [slots, setSlots] = useState(0);
  const [album, setAlbum] = useState<Carta[]>([]);

  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reelsRef = useRef<HTMLDivElement>(null);
  const lineasRef = useRef<SVGSVGElement>(null);
  const escenaRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    fetch("/api/sorteo/participantes")
      .then((r) => r.json())
      .then((d) => setParticipantes(d.participantes || []))
      .catch(() => {});
  }, []);

  // ====== RULETA (tragamonedas) ======
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
    filaObj: number,
  ) => {
    el.style.transition = "none";
    el.style.transform = "translateY(0)";
    el.innerHTML = "";
    const fin = steps + filaObj;
    const len = steps + 3;
    const fp = pool.length ? pool : [ganador];
    for (let i = 0; i < len; i++) {
      const win = esG && i === fin;
      el.appendChild(
        makeSym(win ? ganador : fp[Math.floor(Math.random() * fp.length)], win),
      );
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
    const pool =
      todos.length > 1 ? todos.filter((p) => p.fila !== ganador.fila) : todos;
    const cols = [0, 1, 2, 3, 4];
    const fuera = cols.splice(Math.floor(Math.random() * COLS), 1)[0]; // 1 columna sin ganador
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
      }),
    ).then(() => {});
  };

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
        return [
          r.left - box.left + r.width / 2,
          r.top - box.top + r.height / 2,
        ] as [number, number];
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
    poly.style.transition = "stroke-dashoffset .6s ease";
    poly.style.strokeDashoffset = "0";
  };

  const limpiarReveal = () => {
    if (lineasRef.current) lineasRef.current.innerHTML = "";
    reelsRef.current
      ?.querySelectorAll("[data-win]")
      .forEach((e) => e.classList.remove(styles.win));
  };

  // ====== FIGURITA ======
  const buildCard = (g: P, i: number) => {
    const c = document.createElement("div");
    c.className = `${styles.carta} ${styles.center}`;

    const fondo = document.createElement("div");
    fondo.className = styles.fondo;
    fondo.style.background = fondoFor(i);
    c.appendChild(fondo);

    const arte = document.createElement("img");
    arte.className = styles.arte;
    arte.src = CARTA;
    arte.alt = "";
    c.appendChild(arte);

    const cara = document.createElement("img");
    cara.className = styles.cara;
    cara.src = `/api/foto/${encodeURIComponent(g.dni)}`;
    cara.alt = "";
    cara.onerror = () => {
      cara.style.display = "none";
    };
    c.appendChild(cara);

    const datos = document.createElement("div");
    datos.className = styles.datos;
    datos.textContent = g.nombre;
    c.appendChild(datos);

    return c;
  };

  // figurita: aparece sobre la maquina -> pulso 3x -> vuela al album
  const mostrarFigurita = async (g: P, i: number) => {
    const escena = escenaRef.current;
    const reels = reelsRef.current;
    if (!escena || !reels) return;
    const card = buildCard(g, i);
    const er = escena.getBoundingClientRect();
    const rr = reels.getBoundingClientRect();
    card.style.left = rr.left - er.left + rr.width / 2 + "px";
    card.style.top = rr.top - er.top + rr.height / 2 + "px";
    escena.appendChild(card);
    confeti(i < 3 ? 40 : 24);

    await card.animate(
      [
        { transform: "translate(-50%,-50%) scale(.2)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
      ],
      { duration: 350, easing: "cubic-bezier(.2,1.4,.4,1)", fill: "forwards" },
    ).finished;

    await card.animate(
      [
        { transform: "translate(-50%,-50%) scale(1)" },
        { transform: "translate(-50%,-50%) scale(1.18)" },
        { transform: "translate(-50%,-50%) scale(1)" },
      ],
      { duration: 520, iterations: 3, easing: "ease-in-out" },
    ).finished;

    const slot = slotRefs.current[i];
    if (slot) {
      const cr = card.getBoundingClientRect();
      const sr = slot.getBoundingClientRect();
      const dx = sr.left + sr.width / 2 - (cr.left + cr.width / 2);
      const dy = sr.top + sr.height / 2 - (cr.top + cr.height / 2);
      const sc = sr.width / cr.width;
      await card.animate(
        [
          { transform: "translate(-50%,-50%) scale(1)" },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${sc})`,
          },
        ],
        { duration: 850, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" },
      ).finished;
    }

    setAlbum((prev) => [...prev, { ...g, rank: i }]);
    card.remove();
  };

  const confeti = (n: number) => {
    const cols = [
      "#ffd166",
      "#c0c0c0",
      "#cd7f32",
      "#6c5ce7",
      "#00cec9",
      "#fd79a8",
    ];
    for (let i = 0; i < n; i++) {
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

  // ====== flujo ======
  const correrSecuencia = async (
    todos: P[],
    gs: P[],
    real: boolean,
    clv: string,
  ) => {
    setCorriendo(true);
    setAlbum([]);
    setSlots(gs.length);
    slotRefs.current = [];
    await esperar(60);
    for (let i = 0; i < gs.length; i++) {
      await tirada(todos, gs[i]); // gira la ruleta
      const wins = reelsRef.current?.querySelectorAll("[data-win]");
      if (wins && wins.length) {
        wins.forEach((e) => e.classList.add(styles.win));
        dibujarConexion(wins);
      }
      await esperar(650); // ver la linea ganadora
      await mostrarFigurita(gs[i], i); // figurita -> album
      if (real) {
        fetch("/api/sorteo/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fila: gs[i].fila, clave: clv }),
        }).catch(() => {});
      }
      limpiarReveal();
      await esperar(300);
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
      await correrSecuencia(
        (d.todos || []) as P[],
        d.ganadores as P[],
        modo === "real",
        clave,
      );
    } catch {
      setModalMsg("Error de conexión");
    }
  };

  return (
    <div className={styles.wrap}>
      <h1 style={{ fontWeight: 700, fontSize: 26 }}>🎴 Sorteo EverWear</h1>
      <div className={styles.count}>
        {participantes.length} participantes registrados
      </div>

      <div ref={escenaRef} className={styles.escena}>
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

        <div className={styles.album}>
          <div className={styles.albumTit}>Álbum</div>
          <div className={styles.grid}>
            {Array.from({ length: slots }).map((_, i) => (
              <div
                key={i}
                ref={(el) => {
                  slotRefs.current[i] = el;
                }}
                className={styles.slot}
              >
                {album[i] && (
                  <div className={`${styles.carta} ${styles.thumb}`}>
                    <div
                      className={styles.fondo}
                      style={{ background: fondoFor(i) }}
                    />
                    <img className={styles.arte} src={CARTA} alt="" />
                    <img
                      className={styles.cara}
                      src={`/api/foto/${encodeURIComponent(album[i].dni)}`}
                      alt=""
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                    <div className={styles.datos}>{album[i].nombre}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.controles}>
        <input
          className={styles.cantidad}
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
        />
        <button
          className={styles.principal}
          onClick={iniciar}
          disabled={corriendo}
        >
          Girar
        </button>
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
              <button
                className={styles.btnSec}
                onClick={() => ejecutar("prueba")}
              >
                Probar
              </button>
              <button
                className={styles.principal}
                onClick={() => ejecutar("real")}
              >
                Aceptar
              </button>
            </div>
            <button
              className={styles.cerrar}
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

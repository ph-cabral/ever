"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./sorteo.module.css";

type P = { fila: number; dni: string; nombre: string; img?: string };
type AlbumItem = {
  orden: number;
  dni: string;
  nombre: string;
  marco: string;
  premio?: string | null;
};

const NS = "http://www.w3.org/2000/svg";
const COLS = 5;
const MAX_ALBUM = 10;
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* Marcos disponibles → /public/marcos/<color>.jpg */
const MARCOS = ["oro", "plata", "bronce", "celeste"] as const;

/* Premios del evento. 'marco' = índice 0..3 (0 oro,1 plata,2 bronce,3 celeste) o nombre. */
const PREMIOS: { nombre: string; marco: number | string }[] = [
  { nombre: "1° Oro", marco: 0 },
  { nombre: "2° Plata", marco: 1 },
  { nombre: "3° Bronce", marco: 2 },
  { nombre: "4° Celeste", marco: 3 },
];
const marcoName = (m: number | string) =>
  (typeof m === "number" ? MARCOS[m] : String(m).toLowerCase()) || "oro";
const marcoFile = (m: string) => `/marcos/${m || "oro"}.jpg`;

/* Formación de la cancha (10 posiciones, se llenan por orden 1..10) */
const POS = [
  { x: 50, y: 90, rol: "ARQ" },
  { x: 17, y: 70, rol: "DEF" },
  { x: 39, y: 73, rol: "DEF" },
  { x: 61, y: 73, rol: "DEF" },
  { x: 83, y: 70, rol: "DEF" },
  { x: 25, y: 48, rol: "MED" },
  { x: 50, y: 50, rol: "MED" },
  { x: 75, y: 48, rol: "MED" },
  { x: 36, y: 25, rol: "DEL" },
  { x: 64, y: 25, rol: "DEL" },
];
const iniciales = (n: string) => {
  const t = String(n || "").trim();
  if (/^\d+$/.test(t)) return t.slice(-4);
  return (
    t.split(/\s+/).map((w) => w[0]).join("").slice(0, 3) || "?"
  ).toUpperCase();
};
const hideEl = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = "none";
};

export default function SorteoClient() {
  const [participantes, setParticipantes] = useState<P[]>([]);
  const [cantidad, setCantidad] = useState(3);
  const [corriendo, setCorriendo] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [clave, setClave] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [premioIdx, setPremioIdx] = useState(0);
  const [album, setAlbum] = useState<AlbumItem[]>([]);
  const [recienOrden, setRecienOrden] = useState(0);

  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reelsRef = useRef<HTMLDivElement>(null);
  const lineasRef = useRef<SVGSVGElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const bimgRef = useRef<HTMLImageElement>(null);
  const bnombreRef = useRef<HTMLDivElement>(null);

  const cargarAlbum = useCallback(() => {
    fetch("/api/sorteo/album")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.album)) setAlbum(d.album as AlbumItem[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/sorteo/participantes")
      .then((r) => r.json())
      .then((d) => setParticipantes(d.participantes || []))
      .catch(() => {});
    cargarAlbum();
  }, [cargarAlbum]);

  // ---- construcción de rodillos (ruleta) ----
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

  const jackpot = (g: P) => {
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
    confeti();
  };

  const limpiarReveal = () => {
    if (lineasRef.current) lineasRef.current.innerHTML = "";
    bannerRef.current?.classList.remove(styles.show);
  };

  const confeti = () => {
    const cols = ["#6cb4ee", "#ffffff", "#ffd23f", "#4a90d9", "#f7b500", "#9fd0f5"];
    for (let i = 0; i < 32; i++) {
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

  // ---- persistencia del álbum (tabla Prisma vía /api/sorteo/album) ----
  const persistirAlbum = async (g: P, marco: string, premio: string) => {
    try {
      const r = await fetch("/api/sorteo/album", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni: g.dni, nombre: g.nombre, marco, premio }),
      });
      const d = await r.json();
      if (d.ok && d.item) {
        const it = d.item as AlbumItem;
        setAlbum((prev) =>
          prev.some((a) => a.orden === it.orden)
            ? prev
            : [...prev, it].sort((a, b) => a.orden - b.orden)
        );
        setRecienOrden(it.orden);
      }
    } catch {
      /* noop */
    }
  };

  // ---- flujo ----
  const correrSecuencia = async (todos: P[], gs: P[], real: boolean, clv: string) => {
    setCorriendo(true);
    limpiarReveal();
    const marco = marcoName(PREMIOS[premioIdx]?.marco ?? 0);
    const premioNom = PREMIOS[premioIdx]?.nombre ?? "";
    const base = album.length;
    for (let i = 0; i < gs.length; i++) {
      if (real && base + i >= MAX_ALBUM) break; // tope 10
      await tirada(todos, gs[i]);
      jackpot(gs[i]);
      if (real) {
        fetch("/api/sorteo/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fila: gs[i].fila, clave: clv }),
        }).catch(() => {});
        await persistirAlbum(gs[i], marco, premioNom);
      }
      await esperar(2000);
      limpiarReveal();
      await esperar(250);
    }
    setCorriendo(false);
  };

  const iniciar = () => {
    if (corriendo) return;
    if (album.length >= MAX_ALBUM) {
      alert("El álbum ya tiene los 10 ganadores. Reiniciá el álbum para un nuevo sorteo.");
      return;
    }
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

  const reiniciarAlbum = async () => {
    if (corriendo) return;
    const clv = window.prompt("Contraseña para vaciar el álbum:");
    if (clv == null) return;
    try {
      const r = await fetch("/api/sorteo/album", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: clv }),
      });
      const d = await r.json();
      if (d.ok) {
        setAlbum([]);
        setRecienOrden(0);
      } else {
        window.alert(d.msg || "No autorizado");
      }
    } catch {
      window.alert("Error de conexión");
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.logoWrap}>
        <img className={styles.logoImg} src="/logo-everwear.svg" alt="Ever Wear 50 años" />
      </div>
      <div className={styles.albiBar} />
      <div className={styles.count}>{participantes.length} participantes registrados</div>

      <div className={styles.arena}>
        {/* IZQUIERDA: álbum cancha */}
        <section className={styles.albumCard}>
          <div className={styles.colTit}>
            🏆 Álbum de Campeones
            <span className={styles.badge}>
              {album.length}/{MAX_ALBUM}
            </span>
          </div>

          <div className={styles.cancha}>
            <div className={`${styles.line} ${styles.lineMid}`} />
            <div className={`${styles.line} ${styles.lineCircle}`} />
            <div className={`${styles.line} ${styles.lineSpot}`} />
            <div className={`${styles.line} ${styles.areaT}`} />
            <div className={`${styles.line} ${styles.sixT}`} />
            <div className={`${styles.line} ${styles.areaB}`} />
            <div className={`${styles.line} ${styles.sixB}`} />

            {POS.map((p, i) => {
              const g = album[i];
              const cls =
                styles.slot +
                (g ? "" : " " + styles.vacia) +
                (g && recienOrden === g.orden ? " " + styles.recien : "");
              return (
                <div key={i} className={cls} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                  <div className={styles.dorsal}>{g ? g.orden : i + 1}</div>
                  {g ? (
                    <>
                      <div className={styles.card}>
                        <img className={styles.marco} src={marcoFile(g.marco)} alt="" onError={hideEl} />
                        <div className={styles.iniWin}>{iniciales(g.nombre)}</div>
                        <img
                          className={styles.foto}
                          src={`/api/foto/${encodeURIComponent(g.dni)}`}
                          alt=""
                          onError={hideEl}
                        />
                      </div>
                      <div className={styles.nomCancha}>{g.nombre}</div>
                    </>
                  ) : (
                    <div className={styles.card}>
                      <span className={styles.rol}>{p.rol}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.albumFoot}>
            <span className={styles.cont}>
              Equipo: {album.length}/{MAX_ALBUM}
              {album.length >= MAX_ALBUM ? " ¡Completo!" : ""}
            </span>
            <button className={styles.btnMini} onClick={reiniciarAlbum} disabled={corriendo}>
              ↺ Reiniciar álbum
            </button>
          </div>
        </section>

        {/* DERECHA: ruleta */}
        <section>
          <div className={styles.colTit}>🎰 Ruleta</div>
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
            <small>★ GANADOR ★</small>
            <img ref={bimgRef} alt="" onError={hideEl} />
            <div ref={bnombreRef} className={styles.nom} />
          </div>

          <div className={styles.controles}>
            <select
              className={styles.premioSel}
              value={premioIdx}
              onChange={(e) => setPremioIdx(parseInt(e.target.value) || 0)}
              disabled={corriendo}
              title="Premio (define el marco)"
            >
              {PREMIOS.map((p, i) => (
                <option key={i} value={i}>
                  {p.nombre}
                </option>
              ))}
            </select>
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
              disabled={corriendo || album.length >= MAX_ALBUM}
            >
              Girar
            </button>
          </div>
        </section>
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

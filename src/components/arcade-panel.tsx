"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mark } from "./ui";

/** Optional arcade intro for the sign-in screen's left panel. Everything that
 * moves is drawn on a canvas; texts that matter stay accessible HTML. */
const WORDS = ["AUTOMATIZA", "PUBLICA", "CONECTA", "CRECE", "DOMINA"];
const INTRO_MS = 2400;
const LIME = "#c7f36b";
const VIOLET = "#8f78ff";
// 9×7 pixel ship: X white body, P violet detail.
const SHIP = [
  "....X....",
  "...XXX...",
  "...XPX...",
  "..XXXXX..",
  ".XXXXXXX.",
  "XXX.X.XXX",
  "X.......X",
];
const PIXEL = 5;
// Targets enter just below the identity (which settles around y = 96).
const SPAWN_Y = 170;

type Phase = "intro" | "play" | "done";
type Word = {
  text: string;
  x: number;
  y: number;
  w: number;
  speed: number;
  delay: number;
  alive: boolean;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

export function ArcadePanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(0);
  // Static mode: reduced motion or not enough room → identity + closing message.
  const [staticMode, setStaticMode] = useState(false);
  const phaseRef = useRef<Phase>("intro");
  const game = useRef({
    w: 0,
    h: 0,
    fontSize: 30,
    ship: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    keys: new Set<string>(),
    firing: false,
    cooldown: 0,
    bullets: [] as { x: number; y: number }[],
    words: [] as Word[],
    particles: [] as Particle[],
    stars: [] as { x: number; y: number; s: number; p: number }[],
    kills: 0,
    playStart: 0,
  });

  const goPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const resetWords = useCallback(() => {
    const g = game.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.font = `800 ${g.fontSize}px ${fontStack}`;
    g.words = WORDS.map((text, i) => {
      const w = ctx ? ctx.measureText(text).width : text.length * g.fontSize * 0.7;
      return {
        text,
        w,
        x: laneX(g.w, w),
        y: SPAWN_Y,
        speed: 26,
        delay: i * 2.6,
        alive: true,
      };
    });
    g.bullets = [];
    g.particles = [];
    g.kills = 0;
    g.playStart = performance.now();
    setCount(0);
  }, []);

  // Decide static mode once on mount and whenever the panel size changes.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => {
      const r = panel.getBoundingClientRect();
      setStaticMode(motion.matches || r.width < 340 || r.height < 520);
    };
    decide();
    const observer = new ResizeObserver(decide);
    observer.observe(panel);
    motion.addEventListener("change", decide);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", decide);
    };
  }, []);

  // Intro: identity centered, then it moves up and the targets start falling.
  useEffect(() => {
    // Static mode shows the closing message directly (derived in render).
    if (staticMode) {
      phaseRef.current = "done";
      return;
    }
    const timer = window.setTimeout(() => {
      resetWords();
      goPhase("play");
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [staticMode, goPhase, resetWords]);

  // Canvas sizing (devicePixelRatio) + animation loop. No React state per frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const panel = panelRef.current;
    if (!canvas || !panel) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const g = game.current;
    const resize = () => {
      const r = panel.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      g.w = r.width;
      g.h = r.height;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fontSize = Math.round(Math.min(40, Math.max(22, r.width * 0.055)));
      g.stars = Array.from({ length: Math.round((r.width * r.height) / 9000) }, () => ({
        x: Math.random() * r.width,
        y: Math.random() * r.height,
        s: Math.random() < 0.15 ? 2 : 1,
        p: Math.random() * Math.PI * 2,
      }));
      if (!g.ship.x) {
        g.ship = { x: r.width / 2, y: r.height - 140 };
        g.target = { ...g.ship };
      }
      g.ship.x = Math.min(Math.max(g.ship.x, 30), r.width - 30);
      g.ship.y = Math.min(Math.max(g.ship.y, r.height * 0.55), r.height - 110);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt, now);
      draw(now);
      frame = requestAnimationFrame(loop);
    };
    const update = (dt: number, now: number) => {
      if (phaseRef.current !== "play") return;
      const minY = g.h * 0.55;
      const maxY = g.h - 110;
      // Keyboard moves the target; the ship eases toward it.
      const step = 360 * dt;
      if (g.keys.has("ArrowLeft")) g.target.x -= step;
      if (g.keys.has("ArrowRight")) g.target.x += step;
      if (g.keys.has("ArrowUp")) g.target.y -= step;
      if (g.keys.has("ArrowDown")) g.target.y += step;
      g.target.x = clamp(g.target.x, 30, g.w - 30);
      g.target.y = clamp(g.target.y, minY, maxY);
      g.ship.x += (g.target.x - g.ship.x) * Math.min(1, dt * 12);
      g.ship.y += (g.target.y - g.ship.y) * Math.min(1, dt * 12);
      // Limited fire rate while the trigger is held.
      g.cooldown -= dt;
      if (g.firing && g.cooldown <= 0) {
        g.bullets.push({ x: g.ship.x, y: g.ship.y - 22 });
        g.cooldown = 0.2;
      }
      for (const b of g.bullets) b.y -= 560 * dt;
      g.bullets = g.bullets.filter((b) => b.y > -20);
      const elapsed = (now - g.playStart) / 1000;
      const floor = g.h - 70;
      for (const word of g.words) {
        if (!word.alive || elapsed < word.delay) continue;
        word.y += word.speed * dt;
        // Missed targets re-enter so the sequence can always be completed.
        if (word.y > floor) {
          word.y = SPAWN_Y;
          word.x = laneX(g.w, word.w);
        }
        const top = word.y - g.fontSize * 0.85;
        const hit = g.bullets.findIndex(
          (b) => b.x >= word.x && b.x <= word.x + word.w && b.y >= top && b.y <= word.y + 4,
        );
        const rammed =
          Math.abs(g.ship.x - (word.x + word.w / 2)) < word.w / 2 + 18 &&
          Math.abs(g.ship.y - (word.y - g.fontSize * 0.4)) < g.fontSize * 0.5 + 16;
        if (hit >= 0 || rammed) {
          if (hit >= 0) g.bullets.splice(hit, 1);
          word.alive = false;
          explode(word.x + word.w / 2, word.y - g.fontSize * 0.4);
          g.kills += 1;
          setCount(g.kills);
          if (g.kills === WORDS.length) {
            goPhase("done");
          }
        }
      }
      for (const p of g.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 120 * dt;
        p.life -= dt;
      }
      g.particles = g.particles.filter((p) => p.life > 0);
    };
    const explode = (x: number, y: number) => {
      for (let i = 0; i < 34; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 220;
        g.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.35 + Math.random() * 0.4,
          color: Math.random() < 0.6 ? VIOLET : LIME,
          size: Math.random() < 0.5 ? 3 : 4,
        });
      }
    };
    const draw = (now: number) => {
      ctx.clearRect(0, 0, g.w, g.h);
      // Pixel stars.
      for (const s of g.stars) {
        ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(now / 900 + s.p));
        ctx.fillStyle = "#cfc6ff";
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
      }
      ctx.globalAlpha = 1;
      drawGrid();
      if (phaseRef.current !== "play") return;
      // Targets.
      ctx.font = `800 ${g.fontSize}px ${fontStack}`;
      ctx.textBaseline = "alphabetic";
      const elapsed = (now - g.playStart) / 1000;
      for (const word of g.words) {
        if (!word.alive || elapsed < word.delay) continue;
        ctx.shadowColor = "rgba(143, 120, 255, 0.85)";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#ddd3ff";
        // Short fade-in right after entering.
        ctx.globalAlpha = clamp((word.y - SPAWN_Y) / 40 + 0.15, 0, 1);
        ctx.fillText(word.text, word.x, word.y);
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
      // Shots.
      ctx.fillStyle = LIME;
      for (const b of g.bullets) ctx.fillRect(Math.round(b.x - 1.5), Math.round(b.y), 3, 10);
      // Particles.
      for (const p of g.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      // Ship and a discreet flickering thrust.
      const ox = Math.round(g.ship.x - (SHIP[0].length * PIXEL) / 2);
      const oy = Math.round(g.ship.y - (SHIP.length * PIXEL) / 2);
      SHIP.forEach((row, ry) =>
        [...row].forEach((cell, rx) => {
          if (cell === ".") return;
          ctx.fillStyle = cell === "P" ? VIOLET : "#ffffff";
          ctx.fillRect(ox + rx * PIXEL, oy + ry * PIXEL, PIXEL, PIXEL);
        }),
      );
      ctx.fillStyle = VIOLET;
      const flame = 6 + Math.round(Math.abs(Math.sin(now / 60)) * 6);
      ctx.fillRect(Math.round(g.ship.x - 2.5), oy + SHIP.length * PIXEL + 2, PIXEL, flame);
    };
    const drawGrid = () => {
      // Faint perspective grid along the bottom of the panel.
      const horizon = g.h * 0.8;
      const vanish = g.w / 2;
      ctx.strokeStyle = "rgba(143, 120, 255, 0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -8; i <= 8; i++) {
        ctx.moveTo(vanish + i * 8, horizon);
        ctx.lineTo(vanish + i * (g.w / 6), g.h);
      }
      for (let k = 1; k <= 6; k++) {
        const y = horizon + (g.h - horizon) * Math.pow(k / 6, 1.8);
        ctx.moveTo(0, y);
        ctx.lineTo(g.w, y);
      }
      ctx.stroke();
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [goPhase]);

  // Controls are attached to the panel itself: pointer only over it, keys only
  // while it has focus, so typing in the form is never intercepted.
  const stopInput = useCallback(() => {
    const g = game.current;
    g.keys.clear();
    g.firing = false;
  }, []);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const g = game.current;
    const aim = (event: PointerEvent) => {
      const r = panel.getBoundingClientRect();
      g.target.x = clamp(event.clientX - r.left, 30, g.w - 30);
      g.target.y = clamp(event.clientY - r.top, g.h * 0.55, g.h - 110);
    };
    const down = (event: PointerEvent) => {
      if (phaseRef.current !== "play" || (event.target as HTMLElement).closest("button, a")) return;
      aim(event);
      g.firing = true;
    };
    const release = () => (g.firing = false);
    const keyDown = (event: KeyboardEvent) => {
      if (phaseRef.current !== "play" || event.target !== panel) return;
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        g.keys.add(event.key);
      } else if (event.key === " ") {
        event.preventDefault();
        g.firing = true;
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key.startsWith("Arrow")) g.keys.delete(event.key);
      if (event.key === " ") g.firing = false;
    };
    panel.addEventListener("pointermove", aim);
    panel.addEventListener("pointerdown", down);
    panel.addEventListener("pointerup", release);
    panel.addEventListener("pointerleave", release);
    panel.addEventListener("keydown", keyDown);
    panel.addEventListener("keyup", keyUp);
    panel.addEventListener("blur", stopInput);
    return () => {
      panel.removeEventListener("pointermove", aim);
      panel.removeEventListener("pointerdown", down);
      panel.removeEventListener("pointerup", release);
      panel.removeEventListener("pointerleave", release);
      panel.removeEventListener("keydown", keyDown);
      panel.removeEventListener("keyup", keyUp);
      panel.removeEventListener("blur", stopInput);
    };
  }, [stopInput]);
  const skip = () => {
    stopInput();
    goPhase("done");
  };
  const replay = () => {
    resetWords();
    goPhase("play");
    panelRef.current?.focus();
  };

  const shown: Phase = staticMode ? "done" : phase;
  return (
    <div
      ref={panelRef}
      className={`arcade-panel is-${shown} ${staticMode ? "is-static" : ""}`}
      tabIndex={staticMode ? -1 : 0}
      role="application"
      aria-roledescription="juego"
      aria-label="EZRA · juego de bienvenida opcional"
      aria-describedby="arcade-help"
    >
      <canvas ref={canvasRef} className="arcade-canvas" aria-hidden="true" />
      <div className="arcade-scanlines" aria-hidden="true" />
      <a className="arcade-identity" href="/" aria-label="EZRA · Inicio">
        <span className="arcade-tile">
          <Mark />
        </span>
        <span className="arcade-name">
          EZRA<span className="arcade-dot">.</span>
        </span>
      </a>
      {shown === "done" && (
        <div className="arcade-final" role="status">
          <h2>
            EZRA AUTOMATIZA
            <br />
            TU PRESENCIA
            <br />
            <span>DIGITAL.</span>
          </h2>
          <p>Todas tus redes. Un solo lugar.</p>
          {!staticMode && (
            <button type="button" className="arcade-link" onClick={replay}>
              Volver a jugar ↺
            </button>
          )}
        </div>
      )}
      {shown === "play" && (
        <>
          <p className="arcade-count" aria-live="polite">
            {count} / {WORDS.length}
          </p>
          <div className="arcade-bar">
            <p id="arcade-help">Mouse o flechas · Clic o espacio</p>
            <button type="button" className="arcade-link" onClick={skip}>
              Saltar ↗
            </button>
          </div>
        </>
      )}
      {shown !== "play" && (
        <p id="arcade-help" className="arcade-sr">
          Juego opcional: con el panel enfocado, mové la nave con el mouse o las flechas y disparale
          a las palabras con clic o espacio.
        </p>
      )}
    </div>
  );
}
const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const laneX = (width: number, wordWidth: number) =>
  24 + Math.random() * Math.max(0, width - wordWidth - 48);

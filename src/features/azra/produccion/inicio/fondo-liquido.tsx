"use client";
import { useEffect, useRef } from "react";

/**
 * Fondo de agua en escala de grises (ondas concéntricas suaves) con un shader WebGL propio.
 * Se pausa fuera de pantalla y con la pestaña oculta. Con movimiento reducido dibuja un solo cuadro;
 * sin WebGL queda el degradado de CSS que hay detrás.
 */
const VERTICE = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FRAGMENTO = `precision mediump float;
uniform vec2 r;uniform float t;
float onda(vec2 uv,vec2 c,float f,float v){float d=distance(uv,c);return sin(d*f-t*v)*exp(-d*1.6);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);
  vec2 c=vec2(0.,-.18);
  float a=onda(uv,c,26.,1.1)+.55*onda(uv,c+vec2(.35,.1),18.,.8)+.4*onda(uv,c-vec2(.4,-.05),22.,.9);
  vec2 e=vec2(.002,0.);
  float dx=onda(uv+e.xy,c,26.,1.1)-onda(uv-e.xy,c,26.,1.1);
  float dy=onda(uv+e.yx,c,26.,1.1)-onda(uv-e.yx,c,26.,1.1);
  vec3 n=normalize(vec3(-dx*9.,-dy*9.,1.));
  float luz=dot(n,normalize(vec3(-.4,.6,.8)));
  float g=.86+.08*a+.1*pow(max(luz,0.),18.)-.05*length(uv);
  gl_FragColor=vec4(vec3(clamp(g,0.,1.)),1.);
}`;

export function FondoLiquido({ className = "" }: { className?: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    // Contexto perdido (p. ej. al volver a montar): el lienzo queda oculto y se ve el degradado.
    if (!gl || gl.isContextLost()) return;
    const compilar = (tipo: number, fuente: string) => {
      const s = gl.createShader(tipo)!;
      gl.shaderSource(s, fuente);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const v = compilar(gl.VERTEX_SHADER, VERTICE);
    const f = compilar(gl.FRAGMENT_SHADER, FRAGMENTO);
    if (!v || !f) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");
    canvas.classList.add("ez-liquido-activo");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let cuadro = 0;
    const inicio = performance.now();
    const ajustar = () => {
      // Media resolución: es un fondo desenfocado y así gasta poca GPU.
      const escala = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * escala));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * escala));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const dibujar = (ahora: number) => {
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, reducido ? 2 : (ahora - inicio) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const bucle = (ahora: number) => {
      dibujar(ahora);
      if (visible && !document.hidden && !reducido) cuadro = requestAnimationFrame(bucle);
    };
    ajustar();
    dibujar(performance.now());
    const reanudar = () => {
      cancelAnimationFrame(cuadro);
      if (visible && !document.hidden && !reducido) cuadro = requestAnimationFrame(bucle);
    };
    const tam = new ResizeObserver(() => {
      ajustar();
      dibujar(performance.now());
    });
    tam.observe(canvas);
    const obs = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      reanudar();
    });
    obs.observe(canvas);
    document.addEventListener("visibilitychange", reanudar);
    reanudar();
    return () => {
      cancelAnimationFrame(cuadro);
      tam.disconnect();
      obs.disconnect();
      document.removeEventListener("visibilitychange", reanudar);
      // No se libera el contexto: React (en desarrollo) vuelve a montar el mismo lienzo y lo reutiliza.
      canvas.classList.remove("ez-liquido-activo");
    };
  }, []);
  return <canvas ref={lienzo} className={`ez-liquido ${className}`} aria-hidden="true" />;
}

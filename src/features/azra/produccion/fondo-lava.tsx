"use client";
import { useEffect, useRef } from "react";

/**
 * Fondo tipo lámpara de lava para todo el estudio: metabolas pastel que suben, bajan y se funden
 * despacio detrás del contenido. Shader WebGL propio, a baja resolución y máximo 30 cuadros por segundo;
 * se pausa con la pestaña oculta. Con movimiento reducido dibuja un solo cuadro; sin WebGL queda el
 * degradado de CSS (.ez-lava-respaldo).
 */
const VERTICE = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FRAGMENTO = `precision mediump float;
uniform vec2 r;uniform float t;
const int N=6;
vec3 color(int i){
  if(i==0)return vec3(.78,.76,1.);   // lavanda
  if(i==1)return vec3(.66,.80,1.);   // azul cielo
  if(i==2)return vec3(1.,.80,.90);   // rosa
  if(i==3)return vec3(.75,.94,.88);  // menta
  if(i==4)return vec3(.84,.78,1.);   // lila
  return vec3(.70,.86,1.);           // celeste
}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  float asp=r.x/r.y;
  vec2 q=vec2(uv.x*asp,uv.y);
  float campo=0.;vec3 tinte=vec3(0.);
  for(int i=0;i<N;i++){
    float fi=float(i);
    // Cada mancha sube y baja a su ritmo (como la cera en una lámpara) y se mece de lado.
    float vel=.035+.012*fi;
    vec2 c=vec2((.12+.16*fi+.06*sin(t*.05*(fi+1.)+fi))*asp,.5+.42*sin(t*vel+fi*1.7));
    float rad=.16+.035*sin(t*.07+fi*2.3);
    float d=dot(q-c,q-c);
    float f=rad*rad/(d+1e-4);
    campo+=f;tinte+=color(i)*f;
  }
  tinte/=max(campo,1e-4);
  // Borde suave de la lava y un halo tenue alrededor; el resto, el gris claro de la marca.
  float lava=smoothstep(.85,1.35,campo);
  float halo=smoothstep(.25,.95,campo)*.35;
  vec3 base=vec3(.969,.969,.973);
  vec3 col=mix(base,mix(base,tinte,.55),halo);
  col=mix(col,mix(tinte,vec3(1.),.18),lava*.75);
  gl_FragColor=vec4(col,1.);
}`;

export function FondoLava() {
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
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");
    canvas.classList.add("ez-lava-activa");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Un comienzo distinto en cada visita, para que no se vea siempre igual.
    const desfase = Math.random() * 200;
    let cuadro = 0;
    let ultimo = 0;
    const ajustar = () => {
      // Un tercio de la resolución: es un fondo difuso y así casi no usa la GPU.
      canvas.width = Math.max(1, Math.round(window.innerWidth * 0.33));
      canvas.height = Math.max(1, Math.round(window.innerHeight * 0.33));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const dibujar = (ahora: number) => {
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, desfase + (reducido ? 0 : ahora / 1000));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const bucle = (ahora: number) => {
      if (ahora - ultimo >= 33) {
        ultimo = ahora;
        dibujar(ahora);
      }
      if (!document.hidden && !reducido) cuadro = requestAnimationFrame(bucle);
    };
    const reanudar = () => {
      cancelAnimationFrame(cuadro);
      if (!document.hidden && !reducido) cuadro = requestAnimationFrame(bucle);
    };
    const redimensionar = () => {
      ajustar();
      dibujar(performance.now());
    };
    ajustar();
    dibujar(performance.now());
    reanudar();
    window.addEventListener("resize", redimensionar);
    document.addEventListener("visibilitychange", reanudar);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("resize", redimensionar);
      document.removeEventListener("visibilitychange", reanudar);
      // No se libera el contexto: React (en desarrollo) vuelve a montar el mismo lienzo y lo reutiliza.
      canvas.classList.remove("ez-lava-activa");
    };
  }, []);
  return (
    <div className="ez-lava" aria-hidden="true">
      <div className="ez-lava-respaldo" />
      <canvas ref={lienzo} />
    </div>
  );
}

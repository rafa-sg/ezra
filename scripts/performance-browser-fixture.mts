// Disposable loopback fixture. Never used by the product, never points to data/.
import { createServer, request as forward } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { clerkTestEnvironment, sessionToken } from "../tests/helpers/clerk-fixture";

const root = process.cwd();
await mkdir(path.join(root, "work/perf-browser"), { recursive: true });
const directory = await mkdtemp(path.join(root, "work/perf-browser/data-"));
process.env.EZRA_DATA_DIR = directory;
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
const { crearEvento } = await import("../src/lib/granjas/eventos");
for (let i = 0; i < 100; i++) crearEvento({
  titulo: `Evento de prueba ${String(i + 1).padStart(3, "0")}`,
  fecha: `2027-01-${String(i % 28 + 1).padStart(2, "0")}`, hora: "18:00",
  lugar: "Teatro de prueba", municipio: "San Salvador", departamento: "San Salvador",
  categoria: "cultura", precio: "$5", boletosUrl: null,
  fuenteUrl: `https://example.test/evento-${i}`, descripcion: "Evento ficticio para medir la interfaz. No corresponde a una actividad real.",
  imagenUrl: null, confirmadoEn: {}, sugerencias: {}, notaVerificacion: "",
  granjaId: null, ejecucionId: null,
});

const meter = `<script>
(()=>{
 const stats=window.__ezraPerf={running:false,frames:[],events:[],longTasks:[],actions:[],started:0,ended:0};
 let last=0,raf=0;
 const frame=t=>{if(!stats.running)return;if(last)stats.frames.push(t-last);last=t;raf=requestAnimationFrame(frame)};
 new PerformanceObserver(list=>{if(stats.running)for(const e of list.getEntries())if(e.interactionId&&!e.target?.closest('#fixture-meter'))stats.events.push({name:e.name,duration:e.duration,delay:e.processingStart-e.startTime,processing:e.processingEnd-e.processingStart,id:e.interactionId})}).observe({type:'event',buffered:false,durationThreshold:16});
 new PerformanceObserver(list=>{if(stats.running)for(const e of list.getEntries())stats.longTasks.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:false});
 document.addEventListener('click',e=>{if(stats.running&&!e.target.closest('#fixture-meter'))stats.actions.push({at:performance.now(),label:e.target.textContent.slice(0,60)})},true);
 document.addEventListener('DOMContentLoaded',()=>{
 const bar=document.createElement('div');bar.id='fixture-meter';bar.style='position:fixed;bottom:8px;right:8px;z-index:2147483647;background:#fff;color:#111;padding:8px;border:2px solid #111;font:14px sans-serif;max-width:calc(100vw - 16px);box-sizing:border-box';
 const start=document.createElement('button');start.textContent='Iniciar medición';start.onclick=()=>{stats.frames=[];stats.events=[];stats.longTasks=[];stats.actions=[];stats.started=performance.now();stats.running=true;last=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);status.textContent=' Midiendo'};
 const stop=document.createElement('button');stop.textContent='Terminar medición';stop.onclick=()=>{
 stats.running=false;stats.ended=performance.now();cancelAnimationFrame(raf);status.textContent=' Medición terminada';
 const frames=[...stats.frames].sort((a,b)=>a-b), percentile=p=>frames[Math.min(frames.length-1,Math.floor(frames.length*p))]||0;
 const result={viewport:{width:innerWidth,height:innerHeight},durationMs:stats.ended-stats.started,frameCount:frames.length,frameMedian:percentile(.5),frameP95:percentile(.95),frameP99:percentile(.99),frameMax:frames.at(-1)||0,rafCadenceFps:frames.length*1000/(frames.reduce((a,b)=>a+b,0)||1),over33ms:frames.filter(t=>t>33.34).length,supported:PerformanceObserver.supportedEntryTypes,events:stats.events,longTasks:stats.longTasks,actions:stats.actions};
 let out=document.getElementById('fixture-result');if(!out){out=document.createElement('pre');out.id='fixture-result';out.style='max-height:100px;max-width:min(560px,calc(100vw - 40px));overflow:auto;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere';bar.append(out)}out.textContent=JSON.stringify(result);
 };
 const status=document.createElement('span');status.textContent=' Datos de prueba';bar.append(start,stop,status);document.body.append(bar);
 });
})();
</script>`;

let token = "";
const targetPort = 3142;
const gateway = createServer((req,res)=>{
  const headers={...req.headers,host:req.headers.host,authorization:`Bearer ${token}`,"accept-encoding":"identity"};
  delete headers.cookie;
  const upstream=forward({hostname:"127.0.0.1",port:targetPort,path:req.url,method:req.method,headers},incoming=>{
    const outgoing={...incoming.headers};
    delete outgoing["set-cookie"];
    if(String(outgoing["content-type"]).includes("text/html")){
      delete outgoing["content-length"];
      delete outgoing["content-encoding"];
      let body=""; incoming.setEncoding("utf8");incoming.on("data",c=>body+=c);
      incoming.on("end",()=>{res.writeHead(incoming.statusCode!,outgoing);res.end(body.replace("</head>",meter+"</head>"))});
    }else{res.writeHead(incoming.statusCode!,outgoing);incoming.pipe(res)}
  });
  upstream.on("error",()=>res.writeHead(502).end("Fixture starting"));req.pipe(upstream);
});
await new Promise<void>(resolve=>gateway.listen(0,"127.0.0.1",resolve));
const port=(gateway.address() as {port:number}).port;
const base=`http://localhost:${port}`;
token=sessionToken("owner",base,3600);
const environment=await clerkTestEnvironment(directory);
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(targetPort)],{
  cwd:path.join(root,"work/verify-performance"),
  env:{...process.env,...environment,EZRA_DATA_DIR:directory,EZRA_DIST_DIR:".next-verificar",EZRA_GRANJAS_TRABAJADOR:"0",GEMINI_API_KEY:"",EZRA_PRODUCCION_IA:"0",EZRA_TOKEN_KEY:Buffer.alloc(32,3).toString("base64")},
  stdio:["ignore","pipe","pipe"],
});
let errors="";server.stderr.on("data",c=>errors+=c);
let ready=false;
for(let i=0;i<100;i++){
 try{if((await fetch(base+"/api/granjas/eventos?vista=resumen")).ok){ready=true;break}}catch{ /* fixture starting */ }
 if(server.exitCode!==null)break;
 await new Promise(r=>setTimeout(r,100));
}
if(!ready){server.kill();gateway.close();throw new Error(errors||"Fixture failed")}
console.log(JSON.stringify({url:base+"/azra/produccion?seccion=eventos",events:100,mode:"production",data:directory}));
const stop=()=>{gateway.close();server.kill("SIGTERM");setTimeout(()=>process.exit(0),500)};
process.on("SIGTERM",stop);process.on("SIGINT",stop);

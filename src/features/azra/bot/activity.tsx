"use client";
import { displayDate } from "@/lib/model";
import { useBot } from "./data";

const resultLabels = { ok: "Correcto", blocked: "No aplicado", error: "Error" };

export function ActivityScreen() {
  const { bot } = useBot();
  if (!bot) return null;
  return (
    <div className="bt-stack">
      <p className="az-muted bt-small">
        Registro local de configuración, conocimiento, reglas, pruebas y cambios de control. No
        guarda textos de mensajes, secretos ni datos personales. Todo corresponde a la simulación:
        no hubo envíos reales.
      </p>
      {bot.activity.length === 0 ? (
        <div className="bt-empty">
          <h2>Sin actividad todavía</h2>
          <p>Los cambios que hagas en el bot aparecerán aquí con fecha, acción y resultado.</p>
        </div>
      ) : (
        <div className="bt-card bt-table-wrap">
          <table className="bt-table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Acción</th>
                <th scope="col">Detalle</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {bot.activity.map((item) => (
                <tr key={item.id}>
                  <td>
                    {displayDate(item.at, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{item.action}</td>
                  <td>{item.detail}</td>
                  <td>
                    <span
                      className={`bt-badge is-${item.result === "ok" ? "approved" : "warning"}`}
                    >
                      {resultLabels[item.result]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="bt-card">
        <h2>Preparado para la etapa real (todavía no operativo)</h2>
        <ul className="bt-list">
          <li>Evitar respuestas duplicadas usando el identificador de cada mensaje recibido.</li>
          <li>Reintentar envíos fallidos con espera creciente, sin repetir mensajes.</li>
          <li>Respetar los límites de cada canal, como la ventana de 24 horas de WhatsApp.</li>
        </ul>
        <p className="az-muted bt-small">
          Estas capacidades se implementarán y verificarán con el adaptador de GHL.
        </p>
      </div>
    </div>
  );
}

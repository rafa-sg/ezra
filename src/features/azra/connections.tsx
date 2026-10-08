"use client";
import { connectionStateLabels, currentConnections, type Connections } from "@/lib/bot/connections";
import "./content.css";

/** Shared «Conexiones» view (content creation and the support bot). It only shows
 * verifiable states: with no adapter in place, everything reads «Sin conectar». */
export function ConnectionsPanel({
  connections = currentConnections(),
}: {
  connections?: Connections;
}) {
  const unknown = (value: boolean | null) =>
    value === null ? "Sin verificar" : value ? "Sí" : "No";
  return (
    <div className="az-connections">
      <div className="ec-connection-service">
        <div>
          <strong>GoHighLevel</strong>
          <p>Integración mediante MCP</p>
        </div>
        <span className="ec-connection">{connectionStateLabels[connections.ghl]}</span>
      </div>
      <div className="az-connections-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Canal</th>
              <th scope="col">Integración GHL</th>
              <th scope="col">Canal disponible</th>
              <th scope="col">Cuenta autorizada</th>
              <th scope="col">Habilitado para el bot</th>
            </tr>
          </thead>
          <tbody>
            {connections.channels.map((channel) => (
              <tr key={channel.key}>
                <th scope="row">{channel.name}</th>
                <td>
                  <span className="ec-connection">
                    {connectionStateLabels[channel.ghlIntegration]}
                  </span>
                </td>
                <td>{unknown(channel.channelAvailable)}</td>
                <td>{unknown(channel.accountAuthorized)}</td>
                <td>{channel.botEnabled ? "Sí" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="az-muted">
        Conectar GHL no marcará todas las redes como conectadas: cada canal necesitará su cuenta
        autorizada y habilitarse para el bot por separado. ezrá no pide ni guarda tokens en el
        navegador.
      </p>
    </div>
  );
}

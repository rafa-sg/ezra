"use client";
import { currentConnections, type Connections } from "@/lib/bot/connections";
import { useLanguage, type MessageKey } from "./i18n";
import "./content.css";

export function ConnectionsPanel({
  connections = currentConnections(),
}: {
  connections?: Connections;
}) {
  const { t } = useLanguage();
  const estado = (clave: string) => t(`c_estado_${clave}` as MessageKey);
  const conocido = (valor: boolean | null) =>
    t(valor === null ? "c_sinVerificar" : valor ? "c_si" : "c_no");
  return (
    <div className="az-connections">
      <div className="ec-connection-service">
        <div>
          <strong>{t("c_directa")}</strong>
          <p>{t("c_control")}</p>
        </div>
        <span className="ec-connection">{estado(connections.integration)}</span>
      </div>
      <div className="az-connections-table">
        <table>
          <thead>
            <tr>
              <th scope="col">{t("c_canal")}</th>
              <th scope="col">{t("c_conexion")}</th>
              <th scope="col">{t("c_disponible")}</th>
              <th scope="col">{t("c_autorizada")}</th>
              <th scope="col">{t("c_habilitado")}</th>
            </tr>
          </thead>
          <tbody>
            {connections.channels.map((canal) => (
              <tr key={canal.key}>
                <th scope="row">{canal.name}</th>
                <td>
                  <span className="ec-connection">{estado(canal.integration)}</span>
                </td>
                <td>{conocido(canal.channelAvailable)}</td>
                <td>{conocido(canal.accountAuthorized)}</td>
                <td>{conocido(canal.botEnabled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="az-muted">{t("c_ayuda")}</p>
    </div>
  );
}

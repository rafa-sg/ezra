/** Estado comprobable de conexiones directas: no hay un publicador ni un canal activo. */
export type ConnectionState =
  "not_connected" | "pending" | "connected" | "insufficient_permissions" | "expired" | "error";
export const connectionStateLabels: Record<ConnectionState, string> = {
  not_connected: "Sin conectar",
  pending: "Pendiente",
  connected: "Conectado",
  insufficient_permissions: "Permisos insuficientes",
  expired: "Conexión vencida",
  error: "Error",
};
/** Cada cuenta debe autorizarse por separado; una integración no activa los demás canales. */
export type ChannelConnection = {
  key: "whatsapp" | "messenger" | "instagram";
  name: string;
  integration: ConnectionState;
  channelAvailable: boolean | null;
  accountAuthorized: boolean | null;
  botEnabled: boolean;
};
export type Connections = { integration: ConnectionState; channels: ChannelConnection[] };

/** Verified state today: no adapter exists, so nothing is connected. */
export function currentConnections(): Connections {
  const channel = (key: ChannelConnection["key"], name: string): ChannelConnection => ({
    key,
    name,
    integration: "not_connected",
    channelAvailable: null,
    accountAuthorized: null,
    botEnabled: false,
  });
  return {
    integration: "not_connected",
    channels: [
      channel("whatsapp", "WhatsApp"),
      channel("messenger", "Facebook Messenger"),
      channel("instagram", "Instagram"),
    ],
  };
}

/**
 * Contract a real adapter must satisfy before the bot can run on live channels. Not
 * implemented: direct API capabilities, scopes, webhooks and an always-on executor must be
 * verified first. Delivery must be idempotent (inbound event id), retried with backoff,
 * and respect each channel's limits (e.g. the 24-hour messaging window).
 */
export interface ChannelAdapter {
  status(): Promise<Connections>;
  /** Called by a webhook receiver; must deduplicate by `eventId`. */
  receive(event: {
    eventId: string;
    channel: ChannelConnection["key"];
    conversationId: string;
    text: string;
    at: string;
  }): Promise<void>;
  /** Must be idempotent by `idempotencyKey` so retries never send duplicates. */
  send(message: {
    idempotencyKey: string;
    channel: ChannelConnection["key"];
    conversationId: string;
    text: string;
  }): Promise<{ delivered: boolean; retryAfterMs?: number }>;
}

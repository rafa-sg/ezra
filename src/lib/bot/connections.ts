/**
 * Connection model for the future GHL adapter. Nothing here talks to GHL or to a social
 * network: statuses are only reported when they can be verified, and today none can, so
 * everything starts as «Sin conectar». See docs/features/bot-de-atencion.md.
 */
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
/** Four independent facts per channel: connecting GHL never marks every network as connected. */
export type ChannelConnection = {
  key: "whatsapp" | "messenger" | "instagram";
  name: string;
  ghlIntegration: ConnectionState;
  channelAvailable: boolean | null;
  accountAuthorized: boolean | null;
  botEnabled: boolean;
};
export type Connections = { ghl: ConnectionState; channels: ChannelConnection[] };

/** Verified state today: no adapter exists, so nothing is connected. */
export function currentConnections(): Connections {
  const channel = (key: ChannelConnection["key"], name: string): ChannelConnection => ({
    key,
    name,
    ghlIntegration: "not_connected",
    channelAvailable: null,
    accountAuthorized: null,
    botEnabled: false,
  });
  return {
    ghl: "not_connected",
    channels: [
      channel("whatsapp", "WhatsApp"),
      channel("messenger", "Facebook Messenger"),
      channel("instagram", "Instagram"),
    ],
  };
}

/**
 * Contract a real adapter must satisfy before the bot can run on live channels. Not
 * implemented: GHL MCP capabilities, scopes, webhooks and an always-on executor must be
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

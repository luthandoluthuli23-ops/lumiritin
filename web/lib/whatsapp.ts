export interface CrewPingMessage {
  toE164: string;
  name: string;
  route: string; // "FAPM · C680"
  window: string; // "Sat 12 Oct, 08:00 – 14:00"
  link: string; // one-tap accept page
  minutes: number; // how long the pilot has to respond
}

/**
 * Sends a crew confirm-ping via the WhatsApp Cloud API using an approved template (WHATSAPP_TEMPLATE_CREW_PING,
 * default "crew_request_ping"). Template body params, in order: name, route, window, link, minutes.
 * Without WHATSAPP_TOKEN set it logs instead (local dev). Returns true only if WhatsApp accepted the message.
 * Never throws: the in-app ping already exists, so a WhatsApp failure must not break the dispatch.
 */
export async function sendCrewPing(msg: CrewPingMessage): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_TEMPLATE_CREW_PING ?? "crew_request_ping";

  if (!token || !phoneNumberId) {
    console.log(`[whatsapp:dry-run] crew ping to ${msg.toE164}: ${msg.route}, ${msg.window}, ${msg.minutes} min, ${msg.link}`);
    return false;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.toE164.replace(/^\+/, ""),
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
          components: [{ type: "body", parameters: [msg.name, msg.route, msg.window, msg.link, String(msg.minutes)].map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    if (!res.ok) console.error(`[whatsapp] crew ping failed: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[whatsapp] crew ping failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export interface ExpiryReminder {
  toE164: string;
  name: string;
  item: string; // "Instrument Rating", "Class 1 medical", "ATPL(A) licence"
  expiresOn: string; // ISO date
  daysLeft: number;
}

/**
 * Sends an expiry reminder via the WhatsApp Cloud API using an approved template.
 * Without WHATSAPP_TOKEN set, logs to the console instead (local dev).
 * Template body params, in order: name, item, expiry date, days left.
 * Returns true only if WhatsApp accepted the message, so dry runs aren't recorded as sent.
 */
export async function sendExpiryReminder(msg: ExpiryReminder): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_TEMPLATE_EXPIRY ?? "credential_expiry_reminder";

  if (!token || !phoneNumberId) {
    console.log(`[whatsapp:dry-run] ${msg.toE164}: ${msg.item} expires ${msg.expiresOn} (${msg.daysLeft}d)`);
    return false;
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: msg.toE164.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
        components: [
          {
            type: "body",
            parameters: [msg.name, msg.item, msg.expiresOn, String(msg.daysLeft)].map((text) => ({
              type: "text",
              text,
            })),
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed: HTTP ${res.status} ${await res.text()}`);
  }
  return true;
}

// WhatsApp provider interface. Business-initiated WhatsApp messages must use a template approved by Meta, so every
// message here is "template name + ordered text parameters".
//
//  * MetaCloudProvider: the real thing (WhatsApp Cloud API). Used when WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID set.
//  * ConsoleProvider: logs instead of sending (local dev, tests, or before the account is set up). It reports
//    delivered=false, so nothing is ever recorded as "sent" during a dry run.
//
// To connect a real provider: a Meta Business account with a WhatsApp Business phone number, a permanent access token
// (WHATSAPP_TOKEN), the phone number id (WHATSAPP_PHONE_NUMBER_ID), and each template below approved in WhatsApp
// Manager with the same name, language and number of body parameters.

export interface TemplateMessage {
  toE164: string;
  template: string;
  /** Body parameters, in the template's order ({{1}}, {{2}}, …). */
  params: string[];
  language?: string;
}

export interface SendResult {
  delivered: boolean;
  error?: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(msg: TemplateMessage): Promise<SendResult>;
}

const GRAPH = "https://graph.facebook.com/v21.0";

export class MetaCloudProvider implements WhatsAppProvider {
  readonly name = "meta-cloud";
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendTemplate(msg: TemplateMessage): Promise<SendResult> {
    try {
      const res = await this.fetchImpl(`${GRAPH}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.toE164.replace(/^\+/, ""),
          type: "template",
          template: {
            name: msg.template,
            language: { code: msg.language ?? process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
            ...(msg.params.length ? { components: [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }] } : {}),
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        console.error(`[whatsapp] ${msg.template} failed HTTP ${res.status}: ${body}`);
        return { delivered: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { delivered: true };
    } catch (err) {
      return { delivered: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class ConsoleProvider implements WhatsAppProvider {
  readonly name = "console";
  readonly sent: TemplateMessage[] = [];
  async sendTemplate(msg: TemplateMessage): Promise<SendResult> {
    this.sent.push(msg);
    console.log(`[whatsapp:dry-run] ${msg.template} → ${msg.toE164}: ${msg.params.join(" | ")}`);
    return { delivered: false, error: "not_configured" };
  }
}

export const isWhatsappConfigured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** The configured provider: Meta when its credentials are set, otherwise the console logger. */
export function whatsappProvider(): WhatsAppProvider {
  const token = process.env.WHATSAPP_TOKEN;
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return token && id ? new MetaCloudProvider(token, id) : new ConsoleProvider();
}

/** Template names (overridable per environment). Each must be approved in WhatsApp Manager before it can send. */
export const TEMPLATES = {
  expiry: () => process.env.WHATSAPP_TEMPLATE_EXPIRY ?? "credential_expiry_reminder", // name, item, expiry date, days left
  stateChange: () => process.env.WHATSAPP_TEMPLATE_STATE_CHANGE ?? "verification_state_change", // name, new state, detail
  crewPing: () => process.env.WHATSAPP_TEMPLATE_CREW_PING ?? "crew_request_ping", // name, route, window, link, minutes
};

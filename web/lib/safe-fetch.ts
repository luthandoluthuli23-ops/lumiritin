// Fetching a URL a user typed in is a classic SSRF vector: without care, someone can point it at 127.0.0.1,
// the cloud metadata service or an internal network. This helper only allows public HTTPS hosts, re-checks every
// redirect, caps the response size and time, and never echoes the URL back.
//
// Residual risk: DNS can change between our check and the connection (rebinding). The fetch is authenticated,
// rate-limited, and its body is never returned to the caller, which limits what an attacker could learn.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  if (ip.startsWith("::ffff:")) return isPrivateAddress(ip.slice(7)); // IPv4-mapped IPv6
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

/** Throws UnsafeUrlError unless `raw` is a public https URL (webcal:// is accepted as https). */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new UnsafeUrlError("That is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https:// calendar links are supported.");
  if (url.username || url.password) throw new UnsafeUrlError("Calendar links with embedded credentials are not supported.");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("Only the standard https port is supported.");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("That address is not allowed.");
    return url;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new UnsafeUrlError("That address is not allowed.");

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("We could not find that host.");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new UnsafeUrlError("That address is not allowed.");
  return url;
}

/** GET a public https URL and return its text (max 1 MB, 8 s, 3 redirects, each hop re-validated). */
export async function fetchPublicText(raw: string): Promise<string> {
  let url = await assertPublicHttpsUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "Lumiritin-CalendarSync/1.0" } });
    } catch {
      throw new UnsafeUrlError("We could not reach that calendar. Check the link and try again.");
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new UnsafeUrlError("The calendar link redirected without a destination.");
      url = await assertPublicHttpsUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) throw new UnsafeUrlError(`The calendar server answered with an error (${res.status}).`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new UnsafeUrlError("That calendar file is too large.");

    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new UnsafeUrlError("That calendar file is too large.");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new UnsafeUrlError("The calendar link redirected too many times.");
}

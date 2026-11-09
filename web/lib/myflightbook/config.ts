/**
 * MyFlightbook OAuth settings, read from the environment.
 *
 * Only the client id and secret are required: the three endpoints default to MyFlightbook's published OAuth2
 * addresses (https://github.com/ericberman/MyFlightbookWeb/wiki/1.-Home). They can be overridden to point at a staging
 * server, which MyFlightbook asks developers to use for testing.
 */

export interface MfbConfig {
  clientId: string;
  clientSecret: string;
  /** Browser redirect target for the "Allow access" screen (confidential-client flow). */
  authUrl: string;
  tokenUrl: string;
  /** Base of the resource endpoint; the API method name is appended: `<apiUrl>/<MethodName>`. */
  apiUrl: string;
  /** Space-separated scopes. The importer only reads flights, so `readflight` is all it asks for. */
  scope: string;
}

export const MFB_DEFAULT_URLS = {
  authUrl: "https://myflightbook.com/logbook/mvc/oAuth/Authorize",
  tokenUrl: "https://myflightbook.com/logbook/mvc/oAuth/OAuthToken",
  apiUrl: "https://myflightbook.com/logbook/mvc/oAuth/OAuthResource",
} as const;

/** https is mandatory (MyFlightbook rejects plain http); local http is allowed only outside production, for tests. */
function checkUrl(name: string, value: string, env: NodeJS.ProcessEnv): string {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  const localHttp = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1") && env.NODE_ENV !== "production";
  if (u.protocol !== "https:" && !localHttp) throw new Error(`${name} must be an https:// URL`);
  return value.replace(/\/+$/, "");
}

/** Returns null when the client id/secret are not set (the pilot sees "not set up yet"). Throws on a malformed override. */
export function getMfbConfig(env: NodeJS.ProcessEnv = process.env): MfbConfig | null {
  const clientId = env.MYFLIGHTBOOK_CLIENT_ID?.trim();
  const clientSecret = env.MYFLIGHTBOOK_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const pick = (name: string, fallback: string) => checkUrl(name, env[name]?.trim() || fallback, env);
  // Commas are accepted too: MyFlightbook itself normalises them to spaces.
  const scope = (env.MYFLIGHTBOOK_SCOPE ?? "readflight").replace(/,/g, " ").split(/\s+/).filter(Boolean).join(" ") || "readflight";
  return {
    clientId,
    clientSecret,
    authUrl: pick("MYFLIGHTBOOK_AUTH_URL", MFB_DEFAULT_URLS.authUrl),
    tokenUrl: pick("MYFLIGHTBOOK_TOKEN_URL", MFB_DEFAULT_URLS.tokenUrl),
    apiUrl: pick("MYFLIGHTBOOK_API_URL", MFB_DEFAULT_URLS.apiUrl),
    scope,
  };
}

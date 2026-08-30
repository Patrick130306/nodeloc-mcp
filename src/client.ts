/**
 * HTTP client with cookie-session authentication for NodeLoc.
 *
 * Reverse-engineered from the official Android app:
 * - Login: GET /session/csrf.json -> POST /session (login/password/timezone[/2FA])
 * - Cookie-mode headers: Origin, Referer, X-Requested-With, Discourse-Present
 * - X-CSRF-Token on write requests (and all requests once logged in)
 * - Cloudflare block detection: cf-mitigated header or 403 + cloudflare + HTML
 * - Auto re-login (once) on error_type not_logged_in / invalid_access
 * - Session (cookies + csrf + username) persisted to disk
 */
import fs from "node:fs";
import path from "node:path";

import * as config from "./config.js";

/** Endpoints that must never trigger a session-refresh retry loop. */
const ANONYMOUS_PATHS = new Set([
  "session/csrf.json",
  "session",
  "session/hp.json",
  "session/forgot_password",
  "users",
  "u/confirm-session",
]);

const SESSION_REFRESH_ERRORS = new Set(["not_logged_in", "invalid_access"]);

export class NodeLocError extends Error {}
export class CloudflareBlocked extends NodeLocError {}
export class NeedSecondFactor extends NodeLocError {}
export class NotConfigured extends NodeLocError {}

/** Mirror the app's error aggregation: errors[] + error + message, deduped, max 3 x 300 chars. */
function aggregateErrors(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const raw = data["errors"];
  if (Array.isArray(raw)) parts.push(...raw.map(String));
  for (const key of ["error", "message"] as const) {
    const v = data[key];
    if (v) parts.push(String(v));
  }
  if (data["error_type"]) parts.push(`[${String(data["error_type"])}]`);
  const seen: string[] = [];
  for (const p of parts) {
    const t = p.slice(0, 300);
    if (!seen.includes(t)) seen.push(t);
  }
  return seen.slice(0, 3).join(" | ") || "unknown error";
}

export interface RequestOptions {
  params?: Record<string, string | number>;
  /** Form body; use string[] values for repeated keys (e.g. options[]). */
  form?: Record<string, string | number | string[]>;
  jsonBody?: unknown;
  extraHeaders?: Record<string, string>;
}

interface SessionState {
  cookies: Record<string, string>;
  csrfToken: string;
  username: string;
}

export class NodeLocClient {
  readonly baseUrl = config.BASE_URL;
  csrfToken = "";
  username = "";
  private readonly cookies = new Map<string, string>();
  private readonly sessionFile = path.join(config.DATA_DIR, "session.json");

  constructor() {
    this.loadSession();
  }

  // ---------------------------------------------------------------- //
  // Session persistence
  // ---------------------------------------------------------------- //
  private loadSession(): void {
    try {
      const state = JSON.parse(fs.readFileSync(this.sessionFile, "utf-8")) as SessionState;
      this.csrfToken = state.csrfToken ?? "";
      this.username = state.username ?? "";
      for (const [k, v] of Object.entries(state.cookies ?? {})) this.cookies.set(k, v);
    } catch {
      /* no prior session */
    }
  }

  private saveSession(): void {
    const state: SessionState = {
      cookies: Object.fromEntries(this.cookies),
      csrfToken: this.csrfToken,
      username: this.username,
    };
    const tmp = this.sessionFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, this.sessionFile);
  }

  // ---------------------------------------------------------------- //
  // Cookies
  // ---------------------------------------------------------------- //
  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private storeCookies(resp: Response): void {
    const setCookies: string[] =
      typeof resp.headers.getSetCookie === "function"
        ? resp.headers.getSetCookie()
        : [resp.headers.get("set-cookie")].filter((v): v is string => !!v);
    for (const sc of setCookies) {
      const pair = sc.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  // ---------------------------------------------------------------- //
  // Authentication
  // ---------------------------------------------------------------- //
  private async refreshCsrf(): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/session/csrf.json`, {
      headers: { Accept: "application/json" },
    });
    this.storeCookies(resp); // keep _forum_session — the login POST needs it for the CSRF check
    if (!resp.ok) throw new NodeLocError(`Failed to fetch CSRF token: HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, string>;
    this.csrfToken = data["csrf"] ?? data["csrf_token"] ?? "";
  }

  /** Cookie-session login (app flow A). Returns the logged-in username. */
  async login(secondFactorToken?: string): Promise<string> {
    if (!config.USERNAME || !config.PASSWORD) {
      throw new NotConfigured(
        "NODELOC_USERNAME and NODELOC_PASSWORD must be set to use authenticated tools.",
      );
    }
    await this.refreshCsrf();
    const form: Record<string, string> = {
      login: config.USERNAME,
      password: config.PASSWORD,
      second_factor_method: config.SECOND_FACTOR_METHOD,
      timezone: config.TIMEZONE,
    };
    if (secondFactorToken) form["second_factor_token"] = secondFactorToken;

    const resp = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: this.baseHeaders(true, false),
      body: new URLSearchParams(form),
    });
    this.storeCookies(resp);
    this.checkCloudflare(resp);

    const rawBody = await resp.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new NodeLocError(
        `Login failed with HTTP ${resp.status} (non-JSON response): ${rawBody.slice(0, 200)}`,
      );
    }
    if (resp.status >= 400 || data["error"]) {
      if (data["error_type"] === "invalid_second_factor") {
        throw new NeedSecondFactor("Two-factor token required or invalid: " + aggregateErrors(data));
      }
      throw new NodeLocError(
        `Login failed (HTTP ${resp.status}): ${aggregateErrors(data)} | body: ${rawBody.slice(0, 200)}`,
      );
    }
    // Success responses vary: a user object, {success, username}, or a nested {user: {...}}.
    const userObj = (data["user"] ?? data) as Record<string, unknown>;
    this.username = (userObj["username"] as string) || (data["username"] as string) || config.USERNAME;
    if (data["csrf"]) this.csrfToken = String(data["csrf"]);
    this.saveSession();
    return this.username;
  }

  logout(): void {
    this.cookies.clear();
    this.csrfToken = "";
    this.username = "";
    try {
      fs.unlinkSync(this.sessionFile);
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- //
  // Request plumbing
  // ---------------------------------------------------------------- //
  private baseHeaders(write: boolean, authenticated = true): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const cookie = this.cookieHeader();
    if (cookie) headers["Cookie"] = cookie;
    if (authenticated) {
      // Discourse's CSRF protection also validates Origin/Referer on POSTs,
      // so these are sent even before login (mirrors browser behavior).
      headers["Origin"] = this.baseUrl;
      headers["Referer"] = this.baseUrl + "/";
      headers["X-Requested-With"] = "XMLHttpRequest";
      headers["Discourse-Present"] = "true";
    }
    if (this.csrfToken && (write || this.username)) headers["X-CSRF-Token"] = this.csrfToken;
    return headers;
  }

  private checkCloudflare(resp: Response): void {
    if (resp.headers.get("cf-mitigated")) {
      throw new CloudflareBlocked("Blocked by Cloudflare (cf-mitigated header).");
    }
    const server = (resp.headers.get("server") ?? "").toLowerCase();
    const ctype = (resp.headers.get("content-type") ?? "").toLowerCase();
    if (resp.status === 403 && server.includes("cloudflare") && ctype.includes("text/html")) {
      throw new CloudflareBlocked("Blocked by Cloudflare (403 HTML challenge).");
    }
  }

  /** Single entry point for all forum API calls. */
  async request(method: string, path: string, opts: RequestOptions = {}, retry = true): Promise<unknown> {
    method = method.toUpperCase();
    const write = method !== "GET" && method !== "HEAD";
    const cleanPath = path.replace(/^\/+/, "");

    const url = new URL(`${this.baseUrl}/${cleanPath}`);
    for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, String(v));

    let body: string | undefined;
    const headers: Record<string, string> = { ...this.baseHeaders(write), ...(opts.extraHeaders ?? {}) };
    if (opts.jsonBody !== undefined) {
      body = JSON.stringify(opts.jsonBody);
      headers["Content-Type"] = "application/json";
    } else if (opts.form) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.form)) {
        if (Array.isArray(v)) v.forEach((item) => usp.append(k, item));
        else usp.set(k, String(v));
      }
      body = usp.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const resp = await fetch(url, { method, headers, body, redirect: "follow" });
    this.storeCookies(resp);
    this.checkCloudflare(resp);

    let data: unknown = null;
    if ((resp.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
      try {
        data = await resp.json();
      } catch {
        data = null;
      }
    }

    if (resp.status >= 400) {
      const obj = (data ?? {}) as Record<string, unknown>;
      const errorType = String(obj["error_type"] ?? "");
      if (SESSION_REFRESH_ERRORS.has(errorType) && !ANONYMOUS_PATHS.has(cleanPath) && retry) {
        // Session expired: re-login once, then retry (mirrors the app's
        // AuthGeneration refresh flow, simplified for a CLI context).
        await this.login();
        return this.request(method, cleanPath, opts, false);
      }
      throw new NodeLocError(`HTTP ${resp.status}: ${aggregateErrors(obj)}`);
    }
    return data ?? { ok: true, status: resp.status };
  }

  get(path: string, params?: Record<string, string | number>): Promise<unknown> {
    return this.request("GET", path, { params });
  }
  post(path: string, form?: Record<string, string | number | string[]>, extra?: RequestOptions): Promise<unknown> {
    return this.request("POST", path, { form, ...extra });
  }
  put(path: string, form?: Record<string, string | number | string[]>): Promise<unknown> {
    return this.request("PUT", path, { form });
  }
  del(path: string, form?: Record<string, string | number | string[]>): Promise<unknown> {
    return this.request("DELETE", path, { form });
  }
}

let client: NodeLocClient | null = null;

export function getClient(): NodeLocClient {
  client ??= new NodeLocClient();
  return client;
}

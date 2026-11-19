import type { AppConfig } from "./config";

/**
 * Sign-in with Cognito's hosted UI using the OAuth authorization-code flow + PKCE.
 * Cognito brokers Google / Apple / other providers; we only ever see its tokens.
 * Tokens live in localStorage (fine for this app; they can't do anything but read and edit grocery lists).
 */

interface Session {
  idToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms; Infinity in dev mode
}

const SESSION_KEY = "grocery.session";
const PKCE_KEY = "grocery.pkce";

let session: Session | null = readSession();
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<() => void>();

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return { ...s, expiresAt: s.expiresAt ?? Infinity };
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, expiresAt: Number.isFinite(s.expiresAt) ? s.expiresAt : null }));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable (private mode): the session just won't survive a reload
  }
  listeners.forEach((l) => l());
}

export const isSignedIn = () => session !== null;
export const onSessionChange = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

function jwtExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp: number };
    return payload.exp * 1000;
  } catch {
    return 0;
  }
}

const redirectUri = () => `${window.location.origin}/`;

// ---------- dev mode ----------

export function devSignIn(name: string) {
  saveSession({ idToken: `dev:${name.toLowerCase().replace(/\W/g, "") || "guest"}`, expiresAt: Infinity });
}

// ---------- Cognito ----------

export async function startSignIn(cfg: Extract<AppConfig, { mode: "cognito" }>, providerId: string) {
  const verifier = randomString(48);
  const state = randomString(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const url = new URL(`${cfg.domain}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // "COGNITO" = Cognito's own email + password page; anything else skips straight to that provider.
    ...(providerId === "COGNITO" ? {} : { identity_provider: providerId }),
  }).toString();
  window.location.assign(url.toString());
}

async function tokenRequest(cfg: Extract<AppConfig, { mode: "cognito" }>, params: Record<string, string>) {
  const res = await fetch(`${cfg.domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, ...params }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  return (await res.json()) as { id_token: string; refresh_token?: string };
}

let callbackPromise: Promise<string | null> | null = null;

/** If we just came back from the hosted UI, trade the code for tokens. Returns an error message, if any. */
export function completeSignIn(cfg: AppConfig): Promise<string | null> {
  if (cfg.mode !== "cognito") return Promise.resolve(null);
  // React StrictMode runs effects twice in dev; an auth code can only be used once.
  callbackPromise ??= (async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error_description") ?? params.get("error");
    if (!code && !error) return null;
    window.history.replaceState(null, "", window.location.pathname);
    if (error) return "Sign-in was cancelled or failed. Please try again.";

    let pkce: { verifier: string; state: string } | null = null;
    try {
      pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? "null");
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem(PKCE_KEY);
    if (!pkce || pkce.state !== params.get("state")) return "Sign-in session expired. Please try again.";

    try {
      const t = await tokenRequest(cfg, {
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: redirectUri(),
        code_verifier: pkce.verifier,
      });
      saveSession({ idToken: t.id_token, refreshToken: t.refresh_token, expiresAt: jwtExpiry(t.id_token) });
      return null;
    } catch {
      return "Couldn't finish signing in. Please try again.";
    }
  })();
  return callbackPromise;
}

async function refresh(cfg: AppConfig): Promise<Session | null> {
  if (cfg.mode !== "cognito" || !session?.refreshToken) return null;
  const refreshToken = session.refreshToken;
  try {
    const t = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
    const next = { idToken: t.id_token, refreshToken, expiresAt: jwtExpiry(t.id_token) };
    saveSession(next);
    return next;
  } catch {
    return null;
  }
}

/** A valid ID token for API calls, refreshing it shortly before it expires. Null if signed out. */
export async function getIdToken(cfg: AppConfig, forceRefresh = false): Promise<string | null> {
  if (!session) return null;
  if (!forceRefresh && session.expiresAt - Date.now() > 60_000) return session.idToken;
  refreshing ??= refresh(cfg).finally(() => (refreshing = null));
  const next = await refreshing;
  if (next) return next.idToken;
  saveSession(null); // refresh token expired or revoked
  return null;
}

export function signOut(cfg: AppConfig) {
  saveSession(null);
  if (cfg.mode === "cognito") {
    const url = new URL(`${cfg.domain}/logout`);
    url.search = new URLSearchParams({ client_id: cfg.clientId, logout_uri: redirectUri() }).toString();
    window.location.assign(url.toString());
  }
}

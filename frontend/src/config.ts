export interface Provider {
  id: string; // Cognito identity provider name, e.g. "Google" or "SignInWithApple"
  label: string;
}

export type AppConfig =
  | { mode: "dev" }
  | { mode: "cognito"; domain: string; clientId: string; providers: Provider[] };

/**
 * Runtime config. In AWS, Terraform publishes /config.json next to the site (Cognito domain,
 * client id, enabled providers) so one build works anywhere. During `npm run dev` there is no
 * such file (Vite answers with index.html), so we fall back to fake local sign-in.
 */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (res.ok && res.headers.get("content-type")?.includes("json")) {
      const json = (await res.json()) as { domain: string; clientId: string; providers: Provider[] };
      return { mode: "cognito", domain: json.domain, clientId: json.clientId, providers: json.providers };
    }
  } catch {
    // fall through
  }
  if (import.meta.env.DEV) return { mode: "dev" };
  throw new Error("Could not load the app configuration.");
}

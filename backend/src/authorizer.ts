import { timingSafeEqual } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";

/**
 * API Gateway Lambda authorizer (HTTP API, payload v2, simple responses).
 * A request is allowed only if BOTH hold:
 *
 *  1. It came through CloudFront: CloudFront adds the secret `x-origin-verify`
 *     header to every request it forwards to the API. Direct calls to API
 *     Gateway don't have it.
 *  2. It carries a valid Cognito ID token (`Authorization: Bearer <jwt>`),
 *     i.e. the caller signed in with Google / Apple / another provider.
 *
 * Both headers are identity sources, so API Gateway rejects a request that is
 * missing either one (401) without invoking this function. The verified
 * identity is passed to the API Lambda as authorizer context.
 */

export interface Claims {
  sub: string;
  email?: string;
  name?: string;
  [claim: string]: unknown;
}
export type VerifyToken = (token: string) => Promise<Claims>;

interface AuthEvent {
  headers?: Record<string, string | undefined>;
}

export function createAuthorizer(secret: string, verify: VerifyToken) {
  return async function authorize(event: AuthEvent) {
    const provided = Buffer.from(event.headers?.["x-origin-verify"] ?? "");
    const expected = Buffer.from(secret);
    const fromCloudFront = expected.length > 0 && provided.length === expected.length && timingSafeEqual(provided, expected);
    if (!fromCloudFront) return { isAuthorized: false };

    const match = /^Bearer\s+(\S+)$/i.exec(event.headers?.authorization ?? "");
    if (!match) return { isAuthorized: false };

    try {
      const claims = await verify(match[1]!);
      const email = typeof claims.email === "string" ? claims.email : "";
      const name = typeof claims.name === "string" && claims.name ? claims.name : email.split("@")[0] || "Someone";
      return { isAuthorized: true, context: { userId: claims.sub, email, name } };
    } catch {
      return { isAuthorized: false };
    }
  };
}

let cached: ReturnType<typeof createAuthorizer> | undefined;

export async function handler(event: AuthEvent) {
  if (!cached) {
    const verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID ?? "",
      clientId: process.env.USER_POOL_CLIENT_ID ?? "",
      tokenUse: "id",
    });
    cached = createAuthorizer(process.env.ORIGIN_VERIFY_SECRET ?? "", (t) => verifier.verify(t) as Promise<Claims>);
  }
  return cached(event);
}

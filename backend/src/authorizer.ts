import { timingSafeEqual } from "node:crypto";

/**
 * API Gateway Lambda authorizer (HTTP API, payload v2, simple responses).
 *
 * CloudFront adds a secret `x-origin-verify` header to every request it
 * forwards to the API origin. Requests that reach API Gateway directly do not
 * have it (and cannot guess it), so they are rejected before touching the API
 * Lambda. API Gateway only invokes this function when the header is present
 * (it is the authorizer's identity source), and caches the result.
 */
export async function handler(event: { headers?: Record<string, string | undefined> }) {
  const expected = process.env.ORIGIN_VERIFY_SECRET ?? "";
  const provided = event.headers?.["x-origin-verify"] ?? "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const isAuthorized = expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);

  return { isAuthorized };
}

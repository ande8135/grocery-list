import { describe, expect, it } from "vitest";
import { createAuthorizer, type VerifyToken } from "./authorizer";

const SECRET = "s3cret";
const good: VerifyToken = async (t) => {
  if (t !== "valid.jwt.token") throw new Error("bad token");
  return { sub: "abc-123", email: "pat@example.test", name: "Pat" };
};
const headers = (h: Record<string, string>) => ({ headers: h });

describe("authorizer", () => {
  const authorize = createAuthorizer(SECRET, good);

  it("allows CloudFront traffic with a valid token and passes the identity on", async () => {
    expect(await authorize(headers({ "x-origin-verify": SECRET, authorization: "Bearer valid.jwt.token" }))).toEqual({
      isAuthorized: true,
      context: { userId: "abc-123", email: "pat@example.test", name: "Pat" },
    });
  });

  it("denies a valid token that did not come through CloudFront", async () => {
    expect(await authorize(headers({ authorization: "Bearer valid.jwt.token" }))).toEqual({ isAuthorized: false });
    expect(await authorize(headers({ "x-origin-verify": "wrong!", authorization: "Bearer valid.jwt.token" }))).toEqual({
      isAuthorized: false,
    });
  });

  it("denies CloudFront traffic with a missing, malformed or invalid token", async () => {
    const h = { "x-origin-verify": SECRET };
    expect(await authorize(headers(h))).toEqual({ isAuthorized: false });
    expect(await authorize(headers({ ...h, authorization: "valid.jwt.token" }))).toEqual({ isAuthorized: false });
    expect(await authorize(headers({ ...h, authorization: "Bearer forged" }))).toEqual({ isAuthorized: false });
  });

  it("fails closed when no secret is configured", async () => {
    const open = createAuthorizer("", good);
    expect(await open(headers({ "x-origin-verify": "", authorization: "Bearer valid.jwt.token" }))).toEqual({
      isAuthorized: false,
    });
  });

  it("falls back to the email's local part when the token has no name (e.g. Apple)", async () => {
    const noName = createAuthorizer(SECRET, async () => ({ sub: "x", email: "kim@example.test" }));
    const res = await noName(headers({ "x-origin-verify": SECRET, authorization: "Bearer t" }));
    expect(res).toMatchObject({ isAuthorized: true, context: { name: "kim" } });
  });
});

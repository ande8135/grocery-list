import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { beforeEach, describe, expect, it } from "vitest";
import { handler as authorizer } from "./authorizer";
import { createHandler } from "./handler";
import { MemoryRepo } from "./memoryRepo";

let repo: MemoryRepo;
let call: (routeKey: string, opts?: { id?: string; body?: unknown }) => Promise<{ status: number; json: any }>;

beforeEach(() => {
  repo = new MemoryRepo();
  let tick = 0;
  const handler = createHandler(repo, () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)));
  call = async (routeKey, { id, body } = {}) => {
    const res = (await handler({
      routeKey,
      pathParameters: id ? { id } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    } as unknown as APIGatewayProxyEventV2)) as APIGatewayProxyStructuredResultV2;
    return { status: res.statusCode ?? 0, json: res.body ? JSON.parse(res.body) : undefined };
  };
});

describe("items API", () => {
  it("starts empty", async () => {
    expect(await call("GET /api/items")).toEqual({ status: 200, json: { items: [] } });
  });

  it("creates an item with a client-supplied id and trims the name", async () => {
    const res = await call("POST /api/items", { body: { id: "abc-12345", name: "  Whole   milk " } });
    expect(res.status).toBe(201);
    expect(res.json.item).toMatchObject({ id: "abc-12345", name: "Whole milk", checked: false });
    expect((await call("GET /api/items")).json.items).toHaveLength(1);
  });

  it("generates an id when none is supplied", async () => {
    const res = await call("POST /api/items", { body: { name: "Eggs" } });
    expect(res.json.item.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects duplicates ids, bad ids and bad names", async () => {
    await call("POST /api/items", { body: { id: "abc-12345", name: "Eggs" } });
    expect((await call("POST /api/items", { body: { id: "abc-12345", name: "Eggs" } })).status).toBe(409);
    expect((await call("POST /api/items", { body: { id: "no way!", name: "Eggs" } })).status).toBe(400);
    expect((await call("POST /api/items", { body: { name: "   " } })).status).toBe(400);
    expect((await call("POST /api/items", { body: { name: "x".repeat(81) } })).status).toBe(400);
    expect((await call("POST /api/items", { body: { name: 5 } })).status).toBe(400);
    expect((await call("POST /api/items")).status).toBe(400);
  });

  it("toggles checked and bumps updatedAt", async () => {
    const { json } = await call("POST /api/items", { body: { name: "Bread" } });
    const id = json.item.id;
    const res = await call("PATCH /api/items/{id}", { id, body: { checked: true } });
    expect(res.status).toBe(200);
    expect(res.json.item.checked).toBe(true);
    expect(res.json.item.updatedAt > json.item.updatedAt).toBe(true);
  });

  it("validates patches and 404s on unknown ids", async () => {
    expect((await call("PATCH /api/items/{id}", { id: "nope", body: { checked: true } })).status).toBe(404);
    expect((await call("PATCH /api/items/{id}", { id: "nope", body: {} })).status).toBe(400);
    expect((await call("PATCH /api/items/{id}", { id: "nope", body: { checked: "yes" } })).status).toBe(400);
  });

  it("deletes items idempotently", async () => {
    const { json } = await call("POST /api/items", { body: { name: "Bread" } });
    expect((await call("DELETE /api/items/{id}", { id: json.item.id })).status).toBe(204);
    expect((await call("DELETE /api/items/{id}", { id: json.item.id })).status).toBe(204);
    expect((await call("GET /api/items")).json.items).toEqual([]);
  });

  it("clears only checked items", async () => {
    const a = (await call("POST /api/items", { body: { name: "A" } })).json.item.id;
    await call("POST /api/items", { body: { name: "B" } });
    await call("PATCH /api/items/{id}", { id: a, body: { checked: true } });
    expect((await call("POST /api/items/clear-checked")).json).toEqual({ removed: 1 });
    expect((await call("GET /api/items")).json.items.map((i: { name: string }) => i.name)).toEqual(["B"]);
  });

  it("404s on unknown routes", async () => {
    expect((await call("GET /nope")).status).toBe(404);
  });
});

describe("origin-verify authorizer", () => {
  it("accepts only the matching secret", async () => {
    process.env.ORIGIN_VERIFY_SECRET = "s3cret";
    expect(await authorizer({ headers: { "x-origin-verify": "s3cret" } })).toEqual({ isAuthorized: true });
    expect(await authorizer({ headers: { "x-origin-verify": "wrong!" } })).toEqual({ isAuthorized: false });
    expect(await authorizer({ headers: {} })).toEqual({ isAuthorized: false });
  });

  it("fails closed when no secret is configured", async () => {
    process.env.ORIGIN_VERIFY_SECRET = "";
    expect(await authorizer({ headers: { "x-origin-verify": "" } })).toEqual({ isAuthorized: false });
  });
});

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createHandler, ROUTE_KEYS } from "./handler";
import { MemoryStore } from "./memoryStore";
import { Service } from "./service";

let handler: ReturnType<typeof createHandler>;

beforeEach(() => {
  handler = createHandler(new Service(new MemoryStore()));
});

async function call(
  routeKey: string,
  opts: { user?: string | null; params?: Record<string, string>; body?: unknown; rawBody?: string } = {},
) {
  const user = opts.user === undefined ? "alice" : opts.user;
  const res = (await handler({
    routeKey,
    pathParameters: opts.params,
    body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    requestContext: {
      authorizer: user ? { lambda: { userId: `u-${user}`, email: `${user}@example.test`, name: user } } : undefined,
    },
  } as unknown as APIGatewayProxyEventV2)) as APIGatewayProxyStructuredResultV2;
  return { status: res.statusCode ?? 0, json: res.body ? JSON.parse(res.body) : undefined };
}

describe("HTTP layer", () => {
  it("rejects calls with no authorizer identity", async () => {
    expect((await call("GET /api/me", { user: null })).status).toBe(401);
  });

  it("404s unknown routes", async () => {
    expect((await call("GET /nope")).status).toBe(404);
  });

  it("returns 400 for malformed JSON", async () => {
    expect((await call("POST /api/households", { rawBody: "{nope" })).status).toBe(400);
    expect((await call("POST /api/households", { rawBody: "[1]" })).status).toBe(400);
  });

  it("walks the happy path end to end with the right status codes", async () => {
    expect((await call("GET /api/me")).json.households).toEqual([]);

    const created = await call("POST /api/households", { body: { name: "Home" } });
    expect(created.status).toBe(201);
    const hid = created.json.household.id;
    const lid = created.json.lists[0].id;
    expect((await call("POST /api/households", { body: { name: "Again" } })).status).toBe(409);

    const item = await call("POST /api/households/{hid}/lists/{lid}/items", { params: { hid, lid }, body: { name: "Milk" } });
    expect(item.status).toBe(201);
    const listed = await call("GET /api/households/{hid}/lists/{lid}/items", { params: { hid, lid } });
    expect(listed.json.items).toHaveLength(1);

    const invite = await call("POST /api/households/{hid}/invites", { params: { hid } });
    expect(invite.status).toBe(201);
    const token = invite.json.token;
    expect((await call("GET /api/invites/{token}", { user: "bob", params: { token } })).json.householdName).toBe("Home");
    expect((await call("POST /api/invites/{token}/accept", { user: "bob", params: { token } })).status).toBe(201);
    expect((await call("DELETE /api/households/{hid}/members/{uid}", { user: "bob", params: { hid, uid: "u-bob" } })).status).toBe(204);
    expect((await call("GET /api/households/{hid}", { user: "bob", params: { hid } })).status).toBe(404);
  });

  it("lets a person move an item to another store section", async () => {
    const created = await call("POST /api/households", { body: { name: "Home" } });
    const hid = created.json.household.id;
    const lid = created.json.lists[0].id;
    expect(created.json.categories.map((c: { id: string }) => c.id)).toContain("produce");

    const added = await call("POST /api/households/{hid}/lists/{lid}/items", { params: { hid, lid }, body: { name: "Milk" } });
    expect(added.json.item.category).toBe("other"); // no categorizer in this handler
    const id = added.json.item.id;

    const moved = await call("PATCH /api/households/{hid}/lists/{lid}/items/{id}", {
      params: { hid, lid, id },
      body: { category: "dairy-eggs" },
    });
    expect(moved.status).toBe(200);
    expect(moved.json.item.category).toBe("dairy-eggs");
    const listed = await call("GET /api/households/{hid}/lists/{lid}/items", { params: { hid, lid } });
    expect(listed.json.items[0].category).toBe("dairy-eggs");

    const bad = await call("PATCH /api/households/{hid}/lists/{lid}/items/{id}", { params: { hid, lid, id }, body: { category: "nope" } });
    expect(bad.status).toBe(400);
  });

  it("covers exactly the routes API Gateway declares in Terraform", () => {
    const tf = readFileSync(new URL("../../infra/api_gateway.tf", import.meta.url), "utf8");
    const block = /routes\s*=\s*\[([\s\S]*?)\]/.exec(tf)?.[1] ?? "";
    const declared = [...block.matchAll(/"([A-Z]+ \/[^"]*)"/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...ROUTE_KEYS].sort());
  });
});

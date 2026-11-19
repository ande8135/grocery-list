import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { HttpError } from "./errors";
import type { Service } from "./service";
import type { AuthUser } from "./types";

interface Ctx {
  user: AuthUser;
  p: Record<string, string>;
  body: () => Record<string, unknown>;
  svc: Service;
}
type Result = { status: number; body?: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const noContent = (): Result => ({ status: 204 });

/** Route table. API Gateway's routes (infra/api_gateway.tf) must match these keys; a test checks it. */
const routes: Record<string, (c: Ctx) => Promise<Result>> = {
  "GET /api/me": async (c) => ok(await c.svc.me(c.user)),

  "POST /api/households": async (c) => ok(await c.svc.createHousehold(c.user, c.body()), 201),
  "GET /api/households/{hid}": async (c) => ok(await c.svc.getHousehold(c.user, c.p.hid!)),
  "POST /api/households/{hid}/invites": async (c) => ok(await c.svc.createInvite(c.user, c.p.hid!), 201),
  "DELETE /api/households/{hid}/members/{uid}": async (c) => {
    await c.svc.removeMember(c.user, c.p.hid!, c.p.uid!);
    return noContent();
  },

  "POST /api/households/{hid}/lists": async (c) => ok(await c.svc.createList(c.user, c.p.hid!, c.body()), 201),
  "PATCH /api/households/{hid}/lists/{lid}": async (c) => ok(await c.svc.renameList(c.user, c.p.hid!, c.p.lid!, c.body())),
  "DELETE /api/households/{hid}/lists/{lid}": async (c) => {
    await c.svc.deleteList(c.user, c.p.hid!, c.p.lid!);
    return noContent();
  },

  "GET /api/households/{hid}/lists/{lid}/items": async (c) =>
    ok({ items: await c.svc.listItems(c.user, c.p.hid!, c.p.lid!) }),
  "POST /api/households/{hid}/lists/{lid}/items": async (c) =>
    ok({ item: await c.svc.createItem(c.user, c.p.hid!, c.p.lid!, c.body()) }, 201),
  "POST /api/households/{hid}/lists/{lid}/items/clear-checked": async (c) =>
    ok(await c.svc.clearChecked(c.user, c.p.hid!, c.p.lid!)),
  "PATCH /api/households/{hid}/lists/{lid}/items/{id}": async (c) =>
    ok({ item: await c.svc.updateItem(c.user, c.p.hid!, c.p.lid!, c.p.id!, c.body()) }),
  "DELETE /api/households/{hid}/lists/{lid}/items/{id}": async (c) => {
    await c.svc.removeItem(c.user, c.p.hid!, c.p.lid!, c.p.id!);
    return noContent();
  },

  "GET /api/invites/{token}": async (c) => ok(await c.svc.previewInvite(c.user, c.p.token!)),
  "POST /api/invites/{token}/accept": async (c) => ok(await c.svc.acceptInvite(c.user, c.p.token!), 201),
};

export const ROUTE_KEYS = Object.keys(routes);

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function respond(r: Result): APIGatewayProxyResultV2 {
  return { statusCode: r.status, headers: JSON_HEADERS, body: r.body === undefined ? undefined : JSON.stringify(r.body) };
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, "Body must be a JSON object");
}

/** The authorizer Lambda puts the verified identity in requestContext.authorizer.lambda. */
function authUser(event: APIGatewayProxyEventV2): AuthUser {
  const ctx = (event.requestContext as unknown as { authorizer?: { lambda?: Record<string, unknown> } } | undefined)
    ?.authorizer?.lambda;
  if (!ctx || typeof ctx.userId !== "string" || !ctx.userId) throw new HttpError(401, "Not signed in");
  return {
    userId: ctx.userId,
    email: typeof ctx.email === "string" ? ctx.email : "",
    name: typeof ctx.name === "string" && ctx.name ? ctx.name : "Someone",
  };
}

export function createHandler(svc: Service) {
  return async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const route = routes[event.routeKey];
      if (!route) return respond({ status: 404, body: { error: "Not found" } });
      const user = authUser(event);
      return respond(await route({ user, p: (event.pathParameters ?? {}) as Record<string, string>, body: () => parseBody(event), svc }));
    } catch (err) {
      if (err instanceof HttpError) return respond({ status: err.status, body: { error: err.message } });
      console.error("Unhandled error", err);
      return respond({ status: 500, body: { error: "Something went wrong" } });
    }
  };
}

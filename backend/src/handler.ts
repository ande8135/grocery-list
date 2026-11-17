import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { Item, ItemRepo } from "./types";

const MAX_NAME_LENGTH = 80;
const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function respond(statusCode: number, body?: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new HttpError(400, "Body must be a JSON object");
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "name must be a string");
  // Collapse whitespace and drop control characters.
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length === 0) throw new HttpError(400, "name cannot be empty");
  if (name.length > MAX_NAME_LENGTH) throw new HttpError(400, `name must be ${MAX_NAME_LENGTH} characters or fewer`);
  return name;
}

export function createHandler(repo: ItemRepo, clock: () => Date = () => new Date()) {
  return async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const id = event.pathParameters?.id;
      switch (event.routeKey) {
        case "GET /api/items":
          return respond(200, { items: await repo.list() });

        case "POST /api/items": {
          const body = parseBody(event);
          const now = clock().toISOString();
          let itemId: string = randomUUID();
          if (body.id !== undefined) {
            // Clients may supply the id so optimistic UI updates need no id swap.
            if (typeof body.id !== "string" || !ID_PATTERN.test(body.id)) {
              throw new HttpError(400, "id is invalid");
            }
            itemId = body.id;
          }
          const item: Item = { id: itemId, name: cleanName(body.name), checked: false, createdAt: now, updatedAt: now };
          if (!(await repo.create(item))) throw new HttpError(409, "Item already exists");
          return respond(201, { item });
        }

        case "PATCH /api/items/{id}": {
          if (!id) throw new HttpError(400, "id is required");
          const body = parseBody(event);
          const patch: { name?: string; checked?: boolean } = {};
          if (body.name !== undefined) patch.name = cleanName(body.name);
          if (body.checked !== undefined) {
            if (typeof body.checked !== "boolean") throw new HttpError(400, "checked must be a boolean");
            patch.checked = body.checked;
          }
          if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update");
          const item = await repo.update(id, patch, clock().toISOString());
          if (!item) throw new HttpError(404, "Item not found");
          return respond(200, { item });
        }

        case "DELETE /api/items/{id}":
          if (!id) throw new HttpError(400, "id is required");
          await repo.remove(id);
          return respond(204);

        case "POST /api/items/clear-checked":
          return respond(200, { removed: await repo.clearChecked() });

        default:
          return respond(404, { error: "Not found" });
      }
    } catch (err) {
      if (err instanceof HttpError) return respond(err.status, { error: err.message });
      console.error("Unhandled error", err);
      return respond(500, { error: "Something went wrong" });
    }
  };
}

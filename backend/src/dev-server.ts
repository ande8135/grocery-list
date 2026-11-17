/**
 * Local dev API: runs the real handler against an in-memory store so you can
 * work on the UI without AWS. `npm run dev` starts this alongside Vite, which
 * proxies /api to it.
 */
import { createServer } from "node:http";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createHandler } from "./handler";
import { MemoryRepo } from "./memoryRepo";

const repo = new MemoryRepo();
const handler = createHandler(repo);
const port = Number(process.env.PORT ?? 3001);

const ROUTES: [method: string, pattern: RegExp, routeKey: string][] = [
  ["GET", /^\/api\/items$/, "GET /api/items"],
  ["POST", /^\/api\/items$/, "POST /api/items"],
  ["POST", /^\/api\/items\/clear-checked$/, "POST /api/items/clear-checked"],
  ["PATCH", /^\/api\/items\/([^/]+)$/, "PATCH /api/items/{id}"],
  ["DELETE", /^\/api\/items\/([^/]+)$/, "DELETE /api/items/{id}"],
];

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString("utf8");

  let routeKey = "$default";
  let id: string | undefined;
  for (const [method, pattern, key] of ROUTES) {
    const m = pattern.exec(path);
    if (m && req.method === method) {
      routeKey = key;
      id = m[1];
      break;
    }
  }

  const event = {
    routeKey,
    pathParameters: id ? { id } : undefined,
    body: body || undefined,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;

  const result = (await handler(event)) as { statusCode: number; headers?: Record<string, string>; body?: string };
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
}).listen(port, () => console.log(`Dev API listening on http://localhost:${port}`));

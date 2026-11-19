/**
 * Local dev API: runs the real handler against an in-memory store so you can
 * work on the UI without AWS. `npm run dev` starts this alongside Vite, which
 * proxies /api to it.
 *
 * There is no Cognito here. The dev "sign in" screen sends `Authorization:
 * Bearer dev:<name>` and this server trusts it, so you can be several people
 * (alice, bob...) to try invites and households.
 */
import { createServer } from "node:http";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createHandler, ROUTE_KEYS } from "./handler";
import { MemoryStore } from "./memoryStore";
import { Service } from "./service";

const handler = createHandler(new Service(new MemoryStore()));
const port = Number(process.env.PORT ?? 3001);

const routes = ROUTE_KEYS.map((key) => {
  const [method, path] = key.split(" ") as [string, string];
  const names: string[] = [];
  const pattern = new RegExp("^" + path.replace(/\{(\w+)\}/g, (_, n: string) => (names.push(n), "([^/]+)")) + "$");
  return { key, method, pattern, names };
});

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString("utf8");

  let routeKey = "$default";
  const pathParameters: Record<string, string> = {};
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (m && req.method === r.method) {
      routeKey = r.key;
      r.names.forEach((n, i) => (pathParameters[n] = decodeURIComponent(m[i + 1]!)));
      break;
    }
  }

  const devUser = /^Bearer dev:(\w+)$/.exec(req.headers.authorization ?? "")?.[1];
  const event = {
    routeKey,
    pathParameters,
    body: body || undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: devUser
        ? {
            lambda: {
              userId: `dev-${devUser}`,
              email: `${devUser}@example.test`,
              name: devUser[0]!.toUpperCase() + devUser.slice(1),
            },
          }
        : undefined,
    },
  } as unknown as APIGatewayProxyEventV2;

  const result = (await handler(event)) as { statusCode: number; headers?: Record<string, string>; body?: string };
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
}).listen(port, () => console.log(`Dev API listening on http://localhost:${port}`));

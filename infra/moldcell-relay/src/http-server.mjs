import { createServer } from "node:http";

export function createRelayHttpServer(application, { maxBodyBytes }) {
  const server = createServer(async (request, response) => {
    try {
      const body = await readBoundedBody(request, maxBodyBytes);
      const parsedUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const result = await application({
        method: request.method ?? "GET",
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: request.headers,
        body,
      });
      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      const status = error?.code === "REQUEST_BODY_TOO_LARGE" ? 413 : 500;
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify({ error: status === 413 ? "REQUEST_BODY_TOO_LARGE" : "INTERNAL_ERROR" }));
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

async function readBoundedBody(request, maximumBytes) {
  const announced = request.headers["content-length"];
  if (announced !== undefined && (!/^\d+$/.test(announced) || Number(announced) > maximumBytes)) {
    throw bodyTooLarge();
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw bodyTooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function bodyTooLarge() {
  return Object.assign(new Error("REQUEST_BODY_TOO_LARGE"), { code: "REQUEST_BODY_TOO_LARGE" });
}

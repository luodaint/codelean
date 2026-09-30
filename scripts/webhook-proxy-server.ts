import {
  createServer,
  request as forward,
  type OutgoingHttpHeaders,
} from "node:http";

// Development-only: never expose the numeric-login bypass through a tunnel.
export function webhookProxy(appPort = 3100) {
  const server = createServer(
    { requestTimeout: 15_000, headersTimeout: 10_000 },
    (req, res) => {
      if (req.method !== "POST" || req.url !== "/api/webhooks/github") {
        res.writeHead(404).end();
        req.resume();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      let rejected = false;
      req.on("error", () => res.destroy());
      req.on("data", (chunk: Buffer) => {
        if (rejected) return;
        bytes += chunk.length;
        if (bytes > 2_000_000) {
          rejected = true;
          chunks.length = 0;
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (rejected) return;
        const headers: OutgoingHttpHeaders = { "content-length": bytes };
        for (const name of [
          "content-type",
          "x-github-event",
          "x-github-delivery",
          "x-hub-signature-256",
        ]) {
          if (req.headers[name]) headers[name] = req.headers[name];
        }
        const upstream = forward(
          {
            hostname: "127.0.0.1",
            port: appPort,
            method: "POST",
            path: "/api/webhooks/github",
            headers,
          },
          (reply) => {
            res.writeHead(reply.statusCode ?? 502, {
              "content-type": "application/json",
              "cache-control": "no-store",
            });
            reply.on("error", () => res.destroy());
            reply.pipe(res);
          },
        );
        upstream.setTimeout(15_000, () => upstream.destroy());
        upstream.on("error", () => {
          if (!res.headersSent) res.writeHead(502).end();
          else res.destroy();
        });
        res.on("close", () => upstream.destroy());
        upstream.end(Buffer.concat(chunks));
      });
    },
  );
  server.setTimeout(20_000);
  return server;
}

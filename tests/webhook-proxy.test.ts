import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { webhookProxy } from "../scripts/webhook-proxy-server";

let proxy: Server;
let origin: string;
const received: {
  url?: string;
  body: string;
  signature?: string;
  cookie?: string;
}[] = [];
const app = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  received.push({
    url: req.url,
    body: Buffer.concat(chunks).toString(),
    signature: req.headers["x-hub-signature-256"] as string,
    cookie: req.headers.cookie,
  });
  res.writeHead(202).end('{"status":"accepted"}');
});
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}
beforeAll(async () => {
  proxy = webhookProxy(await listen(app));
  origin = `http://127.0.0.1:${await listen(proxy)}`;
});
afterAll(async () => {
  await Promise.all(
    [proxy, app].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});
it("rejects admin/auth routes, alternate paths and non-POST methods without forwarding", async () => {
  for (const [method, path] of [
    ["GET", "/login"],
    ["POST", "/api/auth/sign-in/email-otp"],
    ["GET", "/api/webhooks/github"],
    ["POST", "/api/webhooks/github/"],
    ["POST", "/api/webhooks/github?redirect=/login"],
  ]) {
    expect((await fetch(origin + path, { method })).status).toBe(404);
  }
  expect(received).toHaveLength(0);
});
it("preserves signed payload bytes and delivery headers without forwarding browser cookies", async () => {
  const body = '{ "hello": "世界" }\n';
  const reply = await fetch(origin + "/api/webhooks/github", {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": "sha256=fixture",
      cookie: "session=private",
    },
  });
  expect(reply.status).toBe(202);
  expect(await reply.json()).toEqual({ status: "accepted" });
  expect(received).toEqual([
    {
      url: "/api/webhooks/github",
      body,
      signature: "sha256=fixture",
      cookie: undefined,
    },
  ]);
});
it("rejects oversized payloads before contacting the app", async () => {
  const count = received.length;
  const reply = await fetch(origin + "/api/webhooks/github", {
    method: "POST",
    body: "x".repeat(2_000_001),
  });
  expect(reply.status).toBe(413);
  expect(received).toHaveLength(count);
});

import { webhookProxy } from "./webhook-proxy-server";

function port(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error(`Invalid ${name}`);
  return value;
}
const proxyPort = port("WEBHOOK_PROXY_PORT", 3101);
const appPort = port("LOCAL_APP_PORT", 3100);
webhookProxy(appPort).listen(proxyPort, "127.0.0.1", () => {
  console.log(
    `Codelean webhook-only proxy listening on http://127.0.0.1:${proxyPort}; forwarding POST /api/webhooks/github to port ${appPort}.`,
  );
});

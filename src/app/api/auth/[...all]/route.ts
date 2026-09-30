import { auth } from "@/lib/auth-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return auth().handler(request);
}
export async function POST(request: Request) {
  // Provider tokens are consumed by trusted server actions, never the browser.
  if (
    new URL(request.url).pathname
      .replace(/\/+$/, "")
      .endsWith("/get-access-token")
  )
    return new Response(null, { status: 403 });
  return auth().handler(request);
}

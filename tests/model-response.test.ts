import { describe, expect, it, vi } from "vitest";
import { readModelResponse } from "../src/lib/model-response";

function response(
  parts: string[],
  split = false,
  contentType = "text/event-stream",
) {
  const bytes = new TextEncoder().encode(parts.join(""));
  return new Response(
    new ReadableStream({
      start(controller) {
        if (split)
          for (let i = 0; i < bytes.length; i++)
            controller.enqueue(bytes.slice(i, i + 1));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: { "content-type": contentType } },
  );
}
const event = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`;
describe("NaN streamed responses", () => {
  it("handles fragmented UTF-8, ignores reasoning, and retains final usage", async () => {
    const data = await readModelResponse(
      response(
        [
          ": keepalive\r\n\r\n",
          event({
            choices: [{ delta: { reasoning_content: "private reasoning" } }],
          }),
          event({ choices: [{ delta: { content: '{"summary":"café",' } }] }),
          event({
            choices: [
              { delta: { content: '"findings":[]}' }, finish_reason: "stop" },
            ],
          }),
          event({ choices: [], usage: { total_tokens: 100 } }),
          "data: [DONE]\r\n\r\n",
        ],
        true,
      ),
    );
    expect(data.choices[0].message.content).toBe(
      '{"summary":"café","findings":[]}',
    );
    expect(data.usage?.total_tokens).toBe(100);
    expect(JSON.stringify(data)).not.toContain("private reasoning");
  });
  it("preserves truncation so the caller rejects the incomplete review", async () => {
    const data = await readModelResponse(
      response([
        event({ choices: [{ delta: {}, finish_reason: "length" }] }),
        "data: [DONE]\n\n",
      ]),
    );
    expect(data.choices[0].finish_reason).toBe("length");
  });
  it("retains the provider reasoning cutoff marker without storing its details", async () => {
    const data = await readModelResponse(
      response([
        event({ choices: [{ delta: {}, finish_reason: "length" }] }),
        event({
          choices: [],
          usage: { total_tokens: 123 },
          nan_truncation: { reason: "private detail" },
        }),
        "data: [DONE]\n\n",
      ]),
    );
    expect(data.nan_truncation).toBe(true);
    expect(data.usage?.total_tokens).toBe(123);
    expect(JSON.stringify(data)).not.toContain("private detail");
  });
  it("rejects a disconnected stream even if it contains complete-looking JSON", async () => {
    await expect(
      readModelResponse(
        response([
          event({
            choices: [{ delta: { content: '{"summary":"ok","findings":[]}' } }],
          }),
        ]),
      ),
    ).rejects.toThrow("before completion");
  });
  it("rejects provider stream errors without exposing their body", async () => {
    await expect(
      readModelResponse(
        response([event({ error: { message: "private provider detail" } })]),
      ),
    ).rejects.toThrow("provider reported a stream error");
  });
  it("bounds streamed answer size", async () => {
    await expect(
      readModelResponse(
        response([
          event({ choices: [{ delta: { content: "x".repeat(80_001) } }] }),
        ]),
      ),
    ).rejects.toThrow("output exceeded");
  });
});

describe("JSON provider responses", () => {
  it("preserves the answer and usage across split UTF-8 while discarding provider reasoning", async () => {
    const data = await readModelResponse(
      response(
        [
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "café",
                  reasoning_content: "private reasoning",
                },
                finish_reason: "stop",
              },
            ],
            usage: { total_tokens: 50, nan_truncation: "provider metadata" },
            internal: "private provider details",
          }),
        ],
        true,
        "application/json",
      ),
    );
    expect(data.choices[0].message.content).toBe("café");
    expect(data.choices[0].finish_reason).toBe("stop");
    expect(data.usage?.total_tokens).toBe(50);
    expect(data.nan_truncation).toBe(true);
    expect(JSON.stringify(data)).not.toContain("private");
    expect(JSON.stringify(data)).not.toContain("provider metadata");
  });

  it("stops and cancels oversized bodies before buffering the whole response", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const chunk = new Uint8Array(1_000_000);
    const body = new ReadableStream(
      {
        pull(controller) {
          reads++;
          controller.enqueue(chunk);
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const res = new Response(body, {
      headers: { "content-type": "application/json", "content-length": "1" },
    });
    await expect(readModelResponse(res)).rejects.toThrow(
      "response exceeded the size limit",
    );
    expect(reads).toBe(33);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("rejects error envelopes even alongside valid-looking choices without exposing details", async () => {
    const res = Response.json({
      error: { message: "private provider details" },
      choices: [{ message: { content: '{"summary":"ok","findings":[]}' } }],
    });
    await expect(readModelResponse(res)).rejects.toThrow(
      "provider reported a response error",
    );
  });

  it("applies the same answer length limit to JSON and SSE", async () => {
    await expect(
      readModelResponse(
        Response.json({
          choices: [{ message: { content: "x".repeat(80_001) } }],
        }),
      ),
    ).rejects.toThrow("output exceeded");
  });

  it.each(["null", "[]", "{private-invalid-response"])(
    "rejects malformed envelopes safely (%s)",
    async (body) => {
      await expect(
        readModelResponse(
          new Response(body, {
            headers: { "content-type": "application/json" },
          }),
        ),
      ).rejects.toThrow("provider returned an unreadable response");
    },
  );
});

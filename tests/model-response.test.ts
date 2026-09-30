import { describe, expect, it } from "vitest";
import { readModelResponse } from "../src/lib/model-response";

function response(parts: string[], split = false) {
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
    { headers: { "content-type": "text/event-stream" } },
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
    expect(data.usage.total_tokens).toBe(100);
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
    expect(data.usage.total_tokens).toBe(123);
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

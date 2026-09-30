export class ModelReviewError extends Error {}

// Consume the provider's SSE stream without storing or exposing reasoning text.
// Streaming keeps long reasoning requests active through the provider's proxy.
export async function readModelResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    try {
      return await response.json();
    } catch {
      throw new ModelReviewError(
        "Model provider returned an unreadable response. No clean review was produced.",
      );
    }
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new ModelReviewError(
      "Model stream has no body. No clean review was produced.",
    );
  const decoder = new TextDecoder();
  let pending = "",
    event = "",
    content = "",
    finishReason: string | null = null;
  let usage: { total_tokens?: number } | undefined;
  let bytes = 0,
    done = false;
  function dispatch() {
    const data = event.trim();
    event = "";
    if (!data) return;
    if (data === "[DONE]") {
      done = true;
      return;
    }
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      throw new ModelReviewError(
        "Model returned an invalid stream event. No clean review was produced.",
      );
    }
    if (chunk.error)
      throw new ModelReviewError(
        "Model provider reported a stream error. No clean review was produced.",
      );
    const choice = chunk.choices?.[0];
    if (typeof choice?.delta?.content === "string")
      content += choice.delta.content;
    if (content.length > 80_000)
      throw new ModelReviewError(
        "Model output exceeded the review limit. No clean review was produced.",
      );
    if (typeof choice?.finish_reason === "string")
      finishReason = choice.finish_reason;
    if (chunk.usage) usage = { total_tokens: chunk.usage.total_tokens };
  }
  try {
    while (!done) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 32_000_000)
        throw new ModelReviewError(
          "Model stream exceeded the size limit. No clean review was produced.",
        );
      pending += decoder.decode(part.value, { stream: true });
      let newline;
      while ((newline = pending.indexOf("\n")) !== -1 && !done) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (!line) dispatch();
        else if (line.startsWith("data:"))
          event += line.slice(5).trimStart() + "\n";
        if (event.length > 256_000)
          throw new ModelReviewError(
            "Model stream event exceeded the size limit. No clean review was produced.",
          );
      }
      if (pending.length > 256_000)
        throw new ModelReviewError(
          "Model stream line exceeded the size limit. No clean review was produced.",
        );
    }
    if (!done || !finishReason)
      throw new ModelReviewError(
        "Model stream ended before completion. No clean review was produced.",
      );
    return {
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage,
    };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

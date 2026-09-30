import { afterEach, expect, it, vi } from "vitest";
import { modelReview, ModelReviewError } from "../src/lib/review";

const files = [
  {
    path: "app.ts",
    content: "const value = 1;",
    patch: "@@ -0,0 +1 @@\n+const value = 1;",
  },
];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  { primaryMs: 215_000, fallbackMs: 200_000, elapsedMs: 415_000, error: null },
  {
    primaryMs: 10_000,
    fallbackMs: 370_000,
    elapsedMs: 370_000,
    error: "request time limit",
  },
  {
    primaryMs: 300_000,
    fallbackMs: 350_000,
    elapsedMs: 600_000,
    error: "total time limit",
  },
])(
  "bounds fallback independently and preserves the run deadline: $elapsedMs ms",
  async ({ primaryMs, fallbackMs, elapsedMs, error }) => {
    vi.useFakeTimers();
    vi.stubEnv("NAN_API_KEY", "test-key");
    vi.stubEnv("NAN_MODEL", "deepseek-v4-flash");
    vi.stubEnv("NAN_FALLBACK_MODEL", "glm5.3-flash");
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal!;
      signals.push(signal);
      const primary =
        JSON.parse(init.body as string).model === "deepseek-v4-flash";
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            signal.removeEventListener("abort", abort);
            resolve(
              Response.json(
                primary
                  ? {
                      choices: [
                        { finish_reason: "length", message: { content: "" } },
                      ],
                      nan_truncation: true,
                    }
                  : {
                      choices: [
                        {
                          message: {
                            content:
                              '{"summary":"Fallback finished","findings":[]}',
                          },
                        },
                      ],
                    },
              ),
            );
          },
          primary ? primaryMs : fallbackMs,
        );
        function abort() {
          clearTimeout(timer);
          reject(signal.reason);
        }
        signal.addEventListener("abort", abort, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const settled = modelReview(files, [], {
      instructions: "Test time budgets",
    }).then(
      (result) => ({ result, error: null }),
      (error) => ({ result: null, error }),
    );
    await vi.advanceTimersByTimeAsync(elapsedMs);
    const outcome = await settled;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);
    if (error) {
      expect(outcome.error).toBeInstanceOf(ModelReviewError);
      expect(outcome.error.message).toContain(error);
      expect(signals[1].aborted).toBe(true);
    } else {
      expect(outcome.error).toBeNull();
      expect(outcome.result?.model).toBe("glm5.3-flash");
      expect(signals[1].aborted).toBe(false);
    }
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("keeps format correction inside the current model's request budget", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NAN_API_KEY", "test-key");
  vi.stubEnv("NAN_MODEL", "deepseek-v4-flash");
  vi.stubEnv("NAN_FALLBACK_MODEL", "glm5.3-flash");
  const signals: AbortSignal[] = [];
  const fetcher = vi.fn((_url: string, init: RequestInit) => {
    const signal = init.signal!;
    signals.push(signal);
    if (signals.length === 1)
      return new Promise<Response>((resolve) =>
        setTimeout(
          () =>
            resolve(
              Response.json({
                choices: [{ message: { content: "invalid JSON" } }],
              }),
            ),
          330_000,
        ),
      );
    return new Promise<Response>((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const settled = modelReview(files, [], {
    instructions: "Test correction timeout",
  }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(360_000);
  expect((await settled).message).toContain("request time limit");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(signals[0]).toBe(signals[1]);
  expect(vi.getTimerCount()).toBe(0);
});

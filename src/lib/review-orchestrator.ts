import { limits } from "./config";
import { ModelReviewError } from "./model-response";

export type ReviewPhase = "Review" | "Security audit" | "Security verification";
type Job = {
  phase: ReviewPhase;
  start: () => Promise<void>;
  reject: (error: unknown) => void;
};

// One shared pool for all specialists in a run, including verification. The
// worker's database lock prevents another run from multiplying this limit.
export class ReviewOrchestrator {
  private controller = new AbortController();
  private queue: Job[] = [];
  private active = 0;
  private lastPhase?: ReviewPhase;
  private counts = new Map<ReviewPhase, { total: number; completed: number }>();
  private progress = Promise.resolve();
  private timer: ReturnType<typeof setTimeout>;

  constructor(
    private onProgress: (message: string) => Promise<void> = async () => {},
    private concurrency = limits.modelConcurrency,
    timeoutMs = limits.modelRunTimeoutMs,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error("Review concurrency must be a positive integer");
    this.timer = setTimeout(
      () =>
        this.abort(
          new ModelReviewError(
            "AI review exceeded its total time limit. No clean review was produced; retry manually or reduce the PR size.",
          ),
        ),
      timeoutMs,
    );
    this.timer.unref();
  }

  get signal() {
    return this.controller.signal;
  }

  abort(error: unknown) {
    if (this.signal.aborted) return;
    this.controller.abort(error);
    for (const job of this.queue.splice(0)) job.reject(error);
  }

  async close() {
    clearTimeout(this.timer);
    await this.progress;
  }

  private report() {
    // Serialize writes and render current counts at write time, after synchronous
    // batch registration, so the first update includes queued batches too.
    this.progress = this.progress.then(() => {
      const message =
        [...this.counts]
          .map(
            ([phase, count]) =>
              `${phase}: ${count.completed}/${count.total} complete`,
          )
          .join(" · ") + ` · ${this.active} active`;
      return this.onProgress(message);
    });
    return this.progress;
  }

  run<T>(
    phase: ReviewPhase,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    const count = this.counts.get(phase) || { total: 0, completed: 0 };
    count.total++;
    this.counts.set(phase, count);
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        phase,
        reject,
        start: async () => {
          let released = false;
          try {
            await this.report();
            this.signal.throwIfAborted();
            const result = await task(this.signal);
            this.signal.throwIfAborted();
            count.completed++;
            this.active--;
            released = true;
            await this.report();
            resolve(result);
          } catch (error) {
            if (!released) this.active--;
            // All scheduled promises are observed by their caller. Abort sibling
            // fetches and reject queued jobs before allowing publication or retry.
            this.abort(error);
            reject(this.signal.reason);
            return;
          }
          this.pump();
        },
      });
      this.pump();
    });
  }

  private pump() {
    while (
      !this.signal.aborted &&
      this.active < this.concurrency &&
      this.queue.length
    ) {
      // Alternate specialists when both have pending work.
      const alternate = this.queue.findIndex(
        (job) => job.phase !== this.lastPhase,
      );
      const [job] = this.queue.splice(alternate < 0 ? 0 : alternate, 1);
      this.lastPhase = job.phase;
      this.active++;
      void job.start();
    }
  }
}

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReviewSkills } from "../src/lib/review-skills";

const roots: string[] = [];
async function fixture(files = ["SKILL.md"], enabled = true) {
  const root = await mkdtemp(join(tmpdir(), "codelean-skills-"));
  roots.push(root);
  await mkdir(join(root, "demo"));
  await writeFile(join(root, "demo/SKILL.md"), "Check tenant isolation.");
  await writeFile(
    join(root, "skills.json"),
    JSON.stringify([
      { id: "demo", name: "Demo", enabled, phase: "security-audit", files },
    ]),
  );
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("deployment-owned review skills", () => {
  it("routes Simplify only to the ordinary review and Cloudflare only to the audit", async () => {
    const review = await loadReviewSkills("review");
    const audit = await loadReviewSkills("security-audit");
    expect(review.versions.map((s) => s.id)).toEqual(["simplify"]);
    expect(review.instructions).toContain("Simplify — Codelean review adapter");
    expect(review.instructions).not.toContain("# Attack Classes");
    expect(audit.instructions).not.toContain(
      "Simplify — Codelean review adapter",
    );
  });
  it("loads the pinned Cloudflare adapter and selected upstream guidance", async () => {
    const skills = await loadReviewSkills("security-audit");
    expect(skills.versions.map((s) => s.id)).toEqual([
      "cloudflare-security-audit",
    ]);
    expect(skills.instructions).toContain("Codelean PR adapter");
    expect(skills.instructions).toContain("# Attack Classes");
    expect(skills.instructions).not.toContain("## Full audit setup");
  });
  it("hashes the actual loaded text and changes versions when edited", async () => {
    const root = await fixture();
    const first = await loadReviewSkills("security-audit", root);
    expect((await loadReviewSkills("security-audit", root)).versions).toEqual(
      first.versions,
    );
    await writeFile(
      join(root, "demo/SKILL.md"),
      "Check authorization and replay.",
    );
    expect(
      (await loadReviewSkills("security-audit", root)).versions[0].sha256,
    ).not.toBe(first.versions[0].sha256);
  });
  it("loads only explicit enabled entries", async () => {
    const root = await fixture(["missing.md"], false);
    await writeFile(join(root, "unlisted.md"), "Do not load me");
    expect(await loadReviewSkills("security-audit", root)).toEqual({
      instructions: "",
      versions: [],
    });
  });
  it.each(["../outside.md", "/absolute.md", "script.cjs"])(
    "rejects unsafe paths: %s",
    async (file) => {
      await expect(
        loadReviewSkills("security-audit", await fixture([file])),
      ).rejects.toThrow("relative Markdown");
    },
  );
  it("rejects symlinks outside the deployment folder", async () => {
    const root = await fixture(["outside.md"]);
    await symlink(join(root, ".."), join(root, "demo/outside.md"));
    await expect(loadReviewSkills("security-audit", root)).rejects.toThrow(
      "escapes",
    );
  });
  it("fails missing or oversized enabled skill files", async () => {
    const root = await fixture(["missing.md"]);
    await expect(loadReviewSkills("security-audit", root)).rejects.toThrow();
    await writeFile(join(root, "demo/missing.md"), "x".repeat(32_001));
    await expect(loadReviewSkills("security-audit", root)).rejects.toThrow(
      "oversized",
    );
  });
  it("enforces the combined prompt budget", async () => {
    const root = await fixture(["one.md", "two.md", "three.md"]);
    for (const file of ["one.md", "two.md", "three.md"])
      await writeFile(join(root, "demo", file), "x".repeat(25_000));
    await expect(loadReviewSkills("security-audit", root)).rejects.toThrow(
      "64 KB",
    );
  });
});

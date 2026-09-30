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
    JSON.stringify([{ id: "demo", name: "Demo", enabled, files }]),
  );
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("deployment-owned review skills", () => {
  it("loads the pinned Cloudflare adapter and selected upstream guidance", async () => {
    const skills = await loadReviewSkills();
    expect(skills.versions.map((s) => s.id)).toEqual([
      "cloudflare-security-audit",
    ]);
    expect(skills.instructions).toContain("Codelean PR adapter");
    expect(skills.instructions).toContain("# Attack Classes");
    expect(skills.instructions).not.toContain("## Full audit setup");
  });
  it("hashes the actual loaded text and changes versions when edited", async () => {
    const root = await fixture();
    const first = await loadReviewSkills(root);
    expect((await loadReviewSkills(root)).versions).toEqual(first.versions);
    await writeFile(
      join(root, "demo/SKILL.md"),
      "Check authorization and replay.",
    );
    expect((await loadReviewSkills(root)).versions[0].sha256).not.toBe(
      first.versions[0].sha256,
    );
  });
  it("loads only explicit enabled entries", async () => {
    const root = await fixture(["missing.md"], false);
    await writeFile(join(root, "unlisted.md"), "Do not load me");
    expect(await loadReviewSkills(root)).toEqual({
      instructions: "",
      versions: [],
    });
  });
  it.each(["../outside.md", "/absolute.md", "script.cjs"])(
    "rejects unsafe paths: %s",
    async (file) => {
      await expect(loadReviewSkills(await fixture([file]))).rejects.toThrow(
        "relative Markdown",
      );
    },
  );
  it("rejects symlinks outside the deployment folder", async () => {
    const root = await fixture(["outside.md"]);
    await symlink(join(root, ".."), join(root, "demo/outside.md"));
    await expect(loadReviewSkills(root)).rejects.toThrow("escapes");
  });
  it("fails missing or oversized enabled skill files", async () => {
    const root = await fixture(["missing.md"]);
    await expect(loadReviewSkills(root)).rejects.toThrow();
    await writeFile(join(root, "demo/missing.md"), "x".repeat(32_001));
    await expect(loadReviewSkills(root)).rejects.toThrow("oversized");
  });
  it("enforces the combined prompt budget", async () => {
    const root = await fixture(["one.md", "two.md", "three.md"]);
    for (const file of ["one.md", "two.md", "three.md"])
      await writeFile(join(root, "demo", file), "x".repeat(25_000));
    await expect(loadReviewSkills(root)).rejects.toThrow("64 KB");
  });
});

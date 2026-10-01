import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const manifestSchema = z
  .array(
    z
      .object({
        id: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(80),
        name: z.string().min(1).max(120),
        enabled: z.boolean(),
        phase: z.enum(["review", "security-audit"]),
        files: z.array(z.string().min(1).max(200)).min(1).max(8),
      })
      .strict(),
  )
  .max(10);

export type SkillVersion = { id: string; name: string; sha256: string };
export type LoadedSkills = { instructions: string; versions: SkillVersion[] };

// Read only deployment-owned files. Never discover skills from PR content or
// accept repository-controlled paths. The root argument is for isolated tests.
export async function loadReviewSkills(
  phase: "review" | "security-audit",
  root = resolve(process.cwd(), "review-skills"),
): Promise<LoadedSkills> {
  const directory = await realpath(root);
  let totalBytes = 0;
  async function boundedRead(path: string, limit: number) {
    const resolved = await realpath(resolve(directory, path));
    const rel = relative(directory, resolved);
    if (rel.startsWith("..") || isAbsolute(rel))
      throw new Error("Skill path escapes review-skills");
    const info = await stat(resolved);
    if (!info.isFile() || info.size > limit)
      throw new Error("Invalid or oversized review skill file");
    const text = await readFile(resolved, "utf8");
    if (Buffer.byteLength(text) > limit)
      throw new Error("Oversized review skill file");
    return text;
  }
  const manifest = manifestSchema.parse(
    JSON.parse(await boundedRead("skills.json", 16_000)),
  );
  if (new Set(manifest.map((s) => s.id)).size !== manifest.length)
    throw new Error("Duplicate review skill id");
  const versions: SkillVersion[] = [];
  const prompts: string[] = [];
  for (const skill of manifest.filter((s) => s.enabled && s.phase === phase)) {
    const parts: string[] = [];
    for (const file of skill.files) {
      if (
        !/^[a-zA-Z0-9_./-]+\.md$/.test(file) ||
        isAbsolute(file) ||
        file.split("/").some((p) => !p || p === "." || p === "..")
      ) {
        throw new Error("Review skill files must be relative Markdown paths");
      }
      const text = await boundedRead(`${skill.id}/${file}`, 32_000);
      totalBytes += Buffer.byteLength(text);
      if (totalBytes > 64_000)
        throw new Error("Enabled review skills exceed the 64 KB prompt budget");
      parts.push(`### ${file}\n${text}`);
    }
    const content = parts.join("\n\n");
    const sha256 = createHash("sha256").update(content).digest("hex");
    versions.push({ id: skill.id, name: skill.name, sha256 });
    prompts.push(`## ${skill.name}\n${content}`);
  }
  return { instructions: prompts.join("\n\n"), versions };
}

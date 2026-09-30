import type { GithubProfile } from "better-auth/social-providers";
import { z } from "zod";
import { signupAllowed } from "./auth-policy";

const profileSchema = z.object({
  id: z.number().int().positive().safe(),
  login: z.string().regex(/^[a-zA-Z0-9-]{1,39}$/),
  name: z.string().max(300).nullable(),
  avatar_url: z.string().url(),
});
const emailsSchema = z.array(
  z.object({
    email: z.email(),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);

// The library owns OAuth state, PKCE and token exchange. This adapter validates
// identity and signup eligibility using GitHub's authenticated API responses.
export async function githubIdentity(token: { accessToken?: string }) {
  if (!token.accessToken) return null;
  try {
    const options = {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    };
    const [profileResponse, emailResponse] = await Promise.all([
      fetch("https://api.github.com/user", options),
      fetch("https://api.github.com/user/emails", options),
    ]);
    if (!profileResponse.ok || !emailResponse.ok) return null;
    const rawProfile = await profileResponse.json();
    const profile = profileSchema.parse(rawProfile);
    const emails = emailsSchema.parse(await emailResponse.json());
    const eligible = emails.filter((e) => e.verified && signupAllowed(e.email));
    const email = eligible.find((e) => e.primary)?.email ?? eligible[0]?.email;
    if (!email) return null;
    const avatar = new URL(profile.avatar_url);
    return {
      user: {
        name: profile.name || profile.login,
        email: email.toLowerCase(),
        emailVerified: true,
        image:
          avatar.protocol === "https:" &&
          avatar.hostname === "avatars.githubusercontent.com"
            ? avatar.toString()
            : undefined,
        githubUsername: profile.login,
        githubId: String(profile.id),
      },
      // Better Auth consumes the validated id; retain the full provider profile.
      data: rawProfile as GithubProfile,
    };
  } catch {
    return null; // Never log provider bodies or tokens on authentication failures.
  }
}

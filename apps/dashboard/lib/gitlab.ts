import { z } from "zod";

const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  refresh_token: z.string().optional(),
});

const userSchema = z.object({
  username: z.string(),
  name: z.string(),
});

export async function exchangeCodeForToken(code: string) {
  const baseUrl = process.env.GITLAB_BASE_URL ?? "https://gitlab.com";
  const callbackUrl = new URL("/auth/callback", process.env.NEXTAUTH_URL ?? "http://localhost:3000");
  const response = await fetch(new URL("/oauth/token", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GITLAB_CLIENT_ID ?? "",
      client_secret: process.env.GITLAB_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl.toString(),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitLab OAuth token exchange failed (${response.status})`);
  }

  return tokenSchema.parse(await response.json());
}

export async function fetchCurrentGitLabUser(accessToken: string) {
  const response = await fetch(new URL("/api/v4/user", process.env.GITLAB_BASE_URL ?? "https://gitlab.com"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitLab user lookup failed (${response.status})`);
  }

  return userSchema.parse(await response.json());
}

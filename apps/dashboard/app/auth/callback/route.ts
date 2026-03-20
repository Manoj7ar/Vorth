import { NextResponse } from "next/server";

import { createSessionCookie } from "@/lib/auth";
import { exchangeCodeForToken, fetchCurrentGitLabUser } from "@/lib/gitlab";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const token = await exchangeCodeForToken(code);
  const user = await fetchCurrentGitLabUser(token.access_token);

  await createSessionCookie({
    accessToken: token.access_token,
    username: user.username,
    name: user.name,
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}

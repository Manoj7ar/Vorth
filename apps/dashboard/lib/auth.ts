import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const sessionCookieName = "vorth_session";

function getSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "development-secret");
}

export interface DashboardSession {
  accessToken: string;
  username?: string;
  name?: string;
  [key: string]: unknown;
}

export function getGitLabAuthUrl() {
  const baseUrl = process.env.GITLAB_BASE_URL ?? "https://gitlab.com";
  const callbackUrl = new URL("/auth/callback", process.env.NEXTAUTH_URL ?? "http://localhost:3000");
  const authorizeUrl = new URL("/oauth/authorize", baseUrl);
  authorizeUrl.searchParams.set("client_id", process.env.GITLAB_CLIENT_ID ?? "");
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "read_user api");
  return authorizeUrl.toString();
}

export async function createSessionCookie(session: DashboardSession) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getSecret());

  cookies().set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function readSession() {
  const token = cookies().get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify<DashboardSession>(token, getSecret());
    return verified.payload;
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await readSession();
  if (!session) {
    redirect("/");
  }
  return session;
}

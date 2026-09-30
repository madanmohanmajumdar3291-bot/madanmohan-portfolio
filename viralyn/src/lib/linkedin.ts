import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt, randomToken } from "./crypto";

// Official APIs only: OpenID Connect sign-in + "Share on LinkedIn" (w_member_social) via the Posts API.
const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
// Overridable only so the publish flow can be exercised against a local stub in tests.
const API_BASE = process.env.LINKEDIN_API_BASE || "https://api.linkedin.com";
const USERINFO_URL = `${API_BASE}/v2/userinfo`;
const POSTS_URL = `${API_BASE}/rest/posts`;
export const SCOPES = ["openid", "profile", "email", "w_member_social"];
const API_VERSION = process.env.LINKEDIN_API_VERSION || "202509";

export const linkedinConfigured = () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.ENCRYPTION_KEY);
const redirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/linkedin/callback`;

export class LinkedInError extends Error {
  constructor(message: string, public status?: number, public expired = false) { super(message); }
}

export async function authorizationUrl(userId: string) {
  const state = randomToken();
  await db.insert(schema.oauthStates).values({ state, userId });
  const q = new URLSearchParams({
    response_type: "code", client_id: process.env.LINKEDIN_CLIENT_ID!, redirect_uri: redirectUri(),
    state, scope: SCOPES.join(" "),
  });
  return `${AUTH_URL}?${q}`;
}

export async function completeAuthorization(userId: string, code: string, state: string) {
  const [row] = await db.delete(schema.oauthStates)
    .where(and(eq(schema.oauthStates.state, state), eq(schema.oauthStates.userId, userId))).returning();
  if (!row || Date.now() - row.createdAt.getTime() > 10 * 60_000) throw new LinkedInError("Sign-in link expired. Please try connecting again.");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: redirectUri(),
      client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) throw new LinkedInError(`LinkedIn rejected the connection: ${token.error_description ?? tokenRes.status}`);

  const me = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());
  if (!me.sub) throw new LinkedInError("LinkedIn did not return your member id.");

  const values = {
    userId, linkedinUserId: me.sub as string, accessToken: encrypt(token.access_token),
    refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
    expiresAt: new Date(Date.now() + Number(token.expires_in ?? 0) * 1000),
    scopes: String(token.scope ?? SCOPES.join(" ")).split(/[ ,]+/).filter(Boolean), status: "connected",
  };
  await db.delete(schema.linkedinAccounts).where(eq(schema.linkedinAccounts.userId, userId));
  await db.insert(schema.linkedinAccounts).values(values);
}

export async function getAccount(userId: string) {
  const [acc] = await db.select().from(schema.linkedinAccounts).where(eq(schema.linkedinAccounts.userId, userId));
  if (acc && acc.status === "connected" && acc.expiresAt && acc.expiresAt < new Date()) {
    await db.update(schema.linkedinAccounts).set({ status: "expired" }).where(eq(schema.linkedinAccounts.id, acc.id));
    return { ...acc, status: "expired" };
  }
  return acc ?? null;
}

/** Publishes text to the member's feed. Returns LinkedIn's post URN; throws with LinkedIn's real reason otherwise. */
export async function publishText(userId: string, text: string): Promise<string> {
  const acc = await getAccount(userId);
  if (!acc) throw new LinkedInError("LinkedIn is not connected.");
  if (acc.status !== "connected") throw new LinkedInError("Your LinkedIn connection has expired. Reconnect to publish.", 401, true);
  if (!acc.scopes.includes("w_member_social")) throw new LinkedInError("Viralyn doesn't have posting permission (w_member_social). Reconnect LinkedIn.");

  const res = await fetch(POSTS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${decrypt(acc.accessToken)}`, "content-type": "application/json",
      "LinkedIn-Version": API_VERSION, "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${acc.linkedinUserId}`, commentary: escapeCommentary(text), visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    }),
  });
  if (res.status === 401) {
    await db.update(schema.linkedinAccounts).set({ status: "expired" }).where(eq(schema.linkedinAccounts.id, acc.id));
    throw new LinkedInError("LinkedIn says the access token is invalid or expired. Reconnect to publish.", 401, true);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInError(`LinkedIn returned ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  const id = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (!id) throw new LinkedInError("LinkedIn accepted the request but returned no post id, so it can't be confirmed as published.");
  return id;
}

/** LinkedIn's "little text" format treats these characters as markup; escape them so posts render literally. */
export function escapeCommentary(text: string) {
  return text.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
}

export const postUrl = (urn: string) => `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/`;

import type { Env } from "./db";
import { generateId, generateToken, getCurrentUser, jsonResponse } from "./db";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

const RP_NAME = "Ticket JSMSR Network";
const RP_ID = "web.ticket.jsmsr.com";
const ORIGIN = "https://web.ticket.jsmsr.com";

function uint8ToBase64url(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToUint8(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// POST /api/auth/passkey/register/options
export async function handlePasskeyRegisterOptions(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const existing = await env.DB.prepare(
    "SELECT credential_id FROM webauthn_credentials WHERE user_id = ?"
  ).bind(user.id).all();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.username as string,
    userDisplayName: user.username as string,
    userID: new TextEncoder().encode(user.id as string),
    attestationType: "none",
    excludeCredentials: existing.results.map((c: any) => ({
      id: c.credential_id as string,
      type: "public-key" as const,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Store challenge in a session row
  const challengeSessionId = generateId("pc");
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(challengeSessionId, user.id, "pch_" + options.challenge, new Date(Date.now() + 5 * 60 * 1000).toISOString()).run();

  return jsonResponse({ options, challengeToken: challengeSessionId });
}

// POST /api/auth/passkey/register/verify
export async function handlePasskeyRegisterVerify(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { response, challengeToken } = await request.json() as {
    response: RegistrationResponseJSON;
    challengeToken: string;
  };

  const session = await env.DB.prepare(
    "SELECT token FROM sessions WHERE id = ? AND user_id = ? AND expires_at > datetime('now')"
  ).bind(challengeToken, user.id).first();

  if (!session || !(session.token as string).startsWith("pch_")) {
    return jsonResponse({ error: "Challenge expired or invalid" }, 400);
  }
  const expectedChallenge = (session.token as string).slice(4);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Verification failed" }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return jsonResponse({ error: "Registration not verified" }, 400);
  }

  const { credential } = verification.registrationInfo;
  const attId = generateId("pk");
  await env.DB.prepare(
    "INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    attId,
    user.id,
    credential.id,
    uint8ToBase64url(credential.publicKey),
    credential.counter,
    response.response.transports?.join(",") || ""
  ).run();

  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(challengeToken).run();

  // 互斥：啟用 Passkey 後自動關閉 TOTP 2FA
  await env.DB.prepare("DELETE FROM user_2fa WHERE user_id = ?").bind(user.id).run();

  return jsonResponse({ verified: true, credentialId: credential.id });
}

// POST /api/auth/passkey/login/options
export async function handlePasskeyLoginOptions(env: Env, request: Request): Promise<Response> {
  const { username } = await request.json() as { username?: string };

  let allowCredentials: { id: string; type: "public-key" }[] = [];

  if (username) {
    const user = await env.DB.prepare("SELECT id FROM users WHERE username = ? OR email = ?").bind(username, username).first();
    if (user) {
      const creds = await env.DB.prepare(
        "SELECT credential_id FROM webauthn_credentials WHERE user_id = ?"
      ).bind(user.id).all();
      allowCredentials = creds.results.map((c: any) => ({
        id: c.credential_id as string,
        type: "public-key" as const,
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: "preferred",
  });

  const challengeSessionId = generateId("pc");
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(challengeSessionId, "_passkey_login", "pch_" + options.challenge, new Date(Date.now() + 5 * 60 * 1000).toISOString()).run();

  return jsonResponse({ options, challengeToken: challengeSessionId });
}

// POST /api/auth/passkey/login/verify
export async function handlePasskeyLoginVerify(env: Env, request: Request): Promise<Response> {
  const { response, challengeToken } = await request.json() as {
    response: AuthenticationResponseJSON;
    challengeToken: string;
  };

  const session = await env.DB.prepare(
    "SELECT token FROM sessions WHERE id = ? AND expires_at > datetime('now')"
  ).bind(challengeToken).first();

  if (!session || !(session.token as string).startsWith("pch_")) {
    return jsonResponse({ error: "Challenge expired" }, 400);
  }
  const expectedChallenge = (session.token as string).slice(4);

  // Find credential and user separately to avoid column name collision
  const cred = await env.DB.prepare(
    "SELECT c.id as cred_id, c.credential_id, c.public_key, c.counter, c.user_id FROM webauthn_credentials c WHERE c.credential_id = ?"
  ).bind(response.id).first();

  if (!cred) return jsonResponse({ error: "Credential not found" }, 400);

  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(cred.user_id).first();
  if (!user) return jsonResponse({ error: "User not found" }, 400);
  if (user.status === "disabled") return jsonResponse({ error: "Account disabled" }, 403);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: cred.credential_id as string,
        publicKey: base64urlToUint8(cred.public_key as string),
        counter: cred.counter as number,
      },
    });
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Verification failed" }, 400);
  }

  if (!verification.verified) {
    return jsonResponse({ error: "Authentication not verified" }, 400);
  }

  await env.DB.prepare(
    "UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?"
  ).bind(verification.authenticationInfo.newCounter, response.id).run();

  const token = generateToken();
  const sessionId = generateId("s");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get("CF-Connecting-IP") || "";

  await env.DB.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(sessionId, cred.user_id, token, expiresAt).run();
  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?")
    .bind(ip, cred.user_id).run();

  // Record login log
  const ua = request.headers.get("User-Agent") || "";
  const logId = generateId("ll");
  await env.DB.prepare(
    "INSERT INTO login_logs (id, user_id, ip, user_agent, logged_in_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).bind(logId, cred.user_id, ip, ua).run();

  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(challengeToken).run();

  return jsonResponse({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
}

// GET /api/auth/passkey/list
export async function handlePasskeyList(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const creds = await env.DB.prepare(
    "SELECT id, credential_id, created_at FROM webauthn_credentials WHERE user_id = ?"
  ).bind(user.id).all();

  return jsonResponse(creds.results);
}

// DELETE /api/auth/passkey/:id
export async function handlePasskeyDelete(env: Env, request: Request, credentialId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const cred = await env.DB.prepare(
    "SELECT id FROM webauthn_credentials WHERE id = ? AND user_id = ?"
  ).bind(credentialId, user.id).first();

  if (!cred) return jsonResponse({ error: "Not found" }, 404);

  await env.DB.prepare("DELETE FROM webauthn_credentials WHERE id = ?").bind(credentialId).run();

  return jsonResponse({ message: "Passkey deleted" });
}

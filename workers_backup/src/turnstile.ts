import type { Env } from "./db";

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
}

export async function verifyTurnstile(env: Env, token: string): Promise<boolean> {
  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true; // No secret key configured, skip verification

  const formData = new FormData();
  formData.append("secret", secretKey);
  formData.append("response", token);

  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  const data = await result.json() as TurnstileResponse;
  return data.success;
}

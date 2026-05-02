// TOTP implementation for Cloudflare Workers (Web Crypto API)

const DIGITS = 6;
const PERIOD = 30;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // Base32

export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function generateOTPAuthURL(secret: string, email: string, issuer: string = "Ticket JSMSR Network"): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&digits=${DIGITS}&period=${PERIOD}`;
}

export async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  // Check current and adjacent windows for clock skew
  for (let offset = -1; offset <= 1; offset++) {
    const expected = await generateHOTP(secret, counter + offset);
    if (expected === code) return true;
  }
  return false;
}

async function generateHOTP(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter, false);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );

  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buffer));
  const offset = signature[signature.length - 1] & 0x0f;
  const code = (
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)
  ) % Math.pow(10, DIGITS);

  return code.toString().padStart(DIGITS, "0");
}

function base32Encode(bytes: Uint8Array): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += ALPHABET[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(str: string): Uint8Array {
  let bits = "";
  for (const c of str.toUpperCase()) {
    const val = ALPHABET.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

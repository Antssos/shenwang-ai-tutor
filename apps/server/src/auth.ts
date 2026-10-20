import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export function constantTimeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("base64url"),
) {
  return {
    salt,
    hash: ((await derive(password, salt, 64)) as Buffer).toString("base64url"),
  };
}
export async function verifyPassword(
  password: string,
  salt: string,
  hash: string,
) {
  const actual = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createOpaqueSessionToken() {
  return randomBytes(32).toString("base64url");
}
export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

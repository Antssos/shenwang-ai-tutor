import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const PASSWORD_KEY_LENGTH = 64

export function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function hashPassword(password: string, salt = randomBytes(16).toString('base64url')) {
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('base64url')
  return { salt, hash }
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = scryptSync(password, salt, PASSWORD_KEY_LENGTH)
  const expected = Buffer.from(expectedHash, 'base64url')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createOpaqueSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

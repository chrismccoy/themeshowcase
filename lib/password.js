/**
 * Hashing and checking the admin password
 */

import crypto from "node:crypto";

const KEY_BYTES = 64;

const SALT_BYTES = 16;

/**
 * Gets a key from a password and a salt.
 */
function derive(password, salt) {
  return crypto.scryptSync(String(password), salt, KEY_BYTES);
}

/**
 * Hashes a password for storing in the environment file.
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  return `scrypt$${salt.toString("base64")}$${derive(password, salt).toString("base64")}`;
}

/**
 * Checks a password against a stored hash.
 */
export function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;

  return crypto.timingSafeEqual(derive(password, salt), expected);
}

/**
 * Compares two strings
 */
export function safeEqual(a, b) {
  const key = crypto.randomBytes(32);
  const digest = (value) => crypto.createHmac("sha256", key).update(String(value)).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

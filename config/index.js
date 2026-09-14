/**
 * Reads and validates everything the application needs (.env file)
 */

import fs from "node:fs";
import path from "node:path";
import { parseEntry } from "../lib/ip-range.js";

/**
 * Screenshot shown when a theme's file is missing.
 */
const DEFAULT_FALLBACK_IMAGE = "/img/placeholder.svg";

/**
 * Where the database lives, relative to the project root.
 */
const DEFAULT_DATABASE_FILE = "data/themes.db";

/**
 * Where uploaded screenshots live, relative to the project root.
 */
const DEFAULT_UPLOAD_DIR = "data/uploads";

/**
 * The largest screenshot that may be uploaded
 */
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * How long a session lasts, in hours, counted from when it started.
 */
const DEFAULT_SESSION_TTL_HOURS = 168;

/**
 * Failed logins allowed inside the window, and how long that window lasts.
 */
const DEFAULT_LOGIN_MAX_ATTEMPTS = 5;
const DEFAULT_LOGIN_WINDOW_MINUTES = 15;

/**
 * What the administrator area calls itself.
 */
const DEFAULT_BRAND_NAME = "Theme Previewer";
const DEFAULT_BRAND_ICON = "fa-solid fa-swatchbook";

/**
 * Strips the IPv4 in IPv6 prefix
 */
export function normalizeIp(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text.startsWith("::ffff:") ? text.slice(7) : text;
}

/**
 * Reads the addresses and ranges allowed into the admin area.
 */
function parseAllowedIps(raw) {
  if (!raw) return [];

  return raw
    .split(",")
    .map(normalizeIp)
    .filter(Boolean)
    .map((entry) => {
      let parsed;
      try {
        parsed = parseEntry(entry);
      } catch (error) {
        throw new Error(`ADMIN_ALLOWED_IPS: ${error.message}`);
      }
      return entry.includes("/") ? `${textOf(parsed.bytes)}/${parsed.bits}` : entry;
    });
}

/**
 * Writes bytes back as an address
 */
function textOf(bytes) {
  if (bytes.length === 4) return bytes.join(".");

  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));

  let bestAt = -1;
  let bestLength = 0;
  let runAt = -1;
  for (let i = 0; i <= groups.length; i += 1) {
    if (i < groups.length && groups[i] === "0") {
      if (runAt === -1) runAt = i;
      continue;
    }
    if (runAt !== -1 && i - runAt > bestLength) {
      bestAt = runAt;
      bestLength = i - runAt;
    }
    runAt = -1;
  }

  if (bestLength < 2) return groups.join(":");
  return `${groups.slice(0, bestAt).join(":")}::${groups.slice(bestAt + bestLength).join(":")}`;
}

/**
 * Reads the forwarding header.
 */
function parseTrustProxy(raw) {
  if (raw === undefined || raw === "") return false;
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw.trim();
}

/**
 * Loads a `.env`
 */
export function loadEnvFileIfPresent(dir) {
  const file = path.join(dir, ".env");
  if (!fs.existsSync(file)) return false;
  process.loadEnvFile(file);
  return true;
}

/**
 * Reads a positive integer from the environment.
 */
function readPositiveIntOrThrow(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`);
  }
  return value;
}

/**
 * Reads a required setting
 */
function readRequired(env, name, hint) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required. ${hint}`);
  return value;
}

/**
 * Extracts the origin of a URL, for the content security policy.
 */
function origin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Parses the header navigation links.
 */
function parseNavLinks(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.split("|").map((part) => part.trim()))
    .filter(([label, href]) => label && href)
    .map(([label, href]) => ({ label, href }));
}

/**
 * Builds the validated configuration object.
 */
export function loadConfig(env = process.env) {
  const fallbackImage = env.FALLBACK_IMAGE || DEFAULT_FALLBACK_IMAGE;
  if (origin(fallbackImage)) {
    throw new Error(
      `FALLBACK_IMAGE must be a path served by this app, not an absolute URL, received "${fallbackImage}"`
    );
  }

  const adminUsername = readRequired(env, "ADMIN_USERNAME", "Pick the name you will sign in with.");
  const adminPasswordHash = readRequired(
    env,
    "ADMIN_PASSWORD_HASH",
    "Run `npm run set-password` and paste the line it prints."
  );
  const sessionSecret = readRequired(
    env,
    "SESSION_SECRET",
    "Any long random string. Changing it signs everyone out."
  );

  const adminAllowedIps = parseAllowedIps(env.ADMIN_ALLOWED_IPS);
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);

  if (adminAllowedIps.length && trustProxy === false) {
    throw new Error(
      "ADMIN_ALLOWED_IPS needs TRUST_PROXY set as well, or every request looks" +
        " like it came from the proxy. Use TRUST_PROXY=1 behind one reverse" +
        " proxy, and make sure that proxy overwrites X-Forwarded-For rather" +
        " than passing the client's own value through."
    );
  }

  return {
    port: readPositiveIntOrThrow(env, "PORT", 3000),
    adminAllowedIps,
    trustProxy,
    adminUsername,
    adminPasswordHash,
    sessionSecret,
    sessionTtlHours: readPositiveIntOrThrow(env, "SESSION_TTL_HOURS", DEFAULT_SESSION_TTL_HOURS),
    loginMaxAttempts: readPositiveIntOrThrow(env, "LOGIN_MAX_ATTEMPTS", DEFAULT_LOGIN_MAX_ATTEMPTS),
    loginWindowMinutes: readPositiveIntOrThrow(
      env,
      "LOGIN_WINDOW_MINUTES",
      DEFAULT_LOGIN_WINDOW_MINUTES
    ),
    brand: {
      name: env.BRAND_NAME || DEFAULT_BRAND_NAME,
      icon: env.BRAND_ICON || DEFAULT_BRAND_ICON,
    },
    databaseFile: env.DATABASE_FILE || DEFAULT_DATABASE_FILE,
    maxImageBytes: readPositiveIntOrThrow(env, "MAX_IMAGE_BYTES", DEFAULT_MAX_IMAGE_BYTES),
    uploadDir: env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR,
    fallbackImage,
    navLinks: parseNavLinks(env.NAV_LINKS),
    isProduction: env.NODE_ENV === "production",
  };
}

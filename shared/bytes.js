/**
 * Prints size
 */

const MEGABYTE = 1024 * 1024;

/**
 * Prints bytes into words.
 */
export function humanBytes(bytes) {
  if (bytes >= MEGABYTE) return `${Math.round(bytes / MEGABYTE)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Naming a picture's format from its own first bytes.
 */

export const SIGNATURE_BYTES = 16;

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function textAt(buffer, text, offset) {
  if (buffer.length < offset + text.length) return false;
  return buffer.toString("latin1", offset, offset + text.length) === text;
}

/**
 * Image format
 */
export function imageTypeOf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png" };
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  if (textAt(buffer, "GIF87a", 0) || textAt(buffer, "GIF89a", 0)) {
    return { mime: "image/gif", extension: "gif" };
  }

  if (textAt(buffer, "RIFF", 0) && textAt(buffer, "WEBP", 8)) {
    return { mime: "image/webp", extension: "webp" };
  }

  if (textAt(buffer, "ftyp", 4) && textAt(buffer, "avif", 8)) {
    return { mime: "image/avif", extension: "avif" };
  }

  return null;
}

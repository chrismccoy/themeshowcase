/**
 * Reading addresses and ranges
 */

/**
 * Reads an IPv4 address
 */
function ipv4Bytes(text) {
  const parts = text.split(".");
  if (parts.length !== 4) return null;

  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i];
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255 || String(value) !== part) return null;
    out[i] = value;
  }
  return out;
}

/**
 * Reads one side of an IPv6 address
 */
function readGroups(part) {
  if (part === "") return [];

  const chunks = part.split(":");
  const groups = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];

    if (chunk.includes(".")) {
      if (i !== chunks.length - 1) return null;
      const four = ipv4Bytes(chunk);
      if (!four) return null;
      groups.push((four[0] << 8) | four[1], (four[2] << 8) | four[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(chunk)) return null;
    groups.push(parseInt(chunk, 16));
  }

  return groups;
}

/**
 * Reads an IPv6 address, filling in `::`
 */
function ipv6Bytes(text) {
  if (!text.includes(":")) return null;

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const head = readGroups(halves[0]);
  const tail = halves.length === 2 ? readGroups(halves[1]) : [];
  if (head === null || tail === null) return null;

  let groups;
  if (halves.length === 2) {
    const gap = 8 - head.length - tail.length;
    if (gap < 1) return null;
    groups = [...head, ...new Array(gap).fill(0), ...tail];
  } else {
    groups = head;
  }

  if (groups.length !== 8) return null;

  const out = new Uint8Array(16);
  groups.forEach((group, i) => {
    out[i * 2] = group >> 8;
    out[i * 2 + 1] = group & 255;
  });
  return out;
}

/**
 * Reads an address of either type as bytes
 */
export function toBytes(text) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  return ipv4Bytes(value) ?? ipv6Bytes(value);
}

/**
 * Reads the allow list entry
 */
export function parseEntry(text) {
  const value = String(text ?? "").trim();
  const slash = value.indexOf("/");

  if (slash === -1) {
    const bytes = toBytes(value);
    if (!bytes) throw new Error(`"${value}" is not an address`);
    return { bytes, bits: bytes.length * 8 };
  }

  const bytes = toBytes(value.slice(0, slash));
  if (!bytes) throw new Error(`"${value}" is not an address and a prefix length`);

  const prefix = value.slice(slash + 1);
  const bits = Number(prefix);
  if (!/^\d+$/.test(prefix) || bits > bytes.length * 8) {
    throw new Error(
      `"${value}" has a prefix length that is not a whole number of bits between 0 and ${
        bytes.length * 8
      }`
    );
  }

  return { bytes: mask(bytes, bits), bits };
}

/**
 * Clears the bits beyond the prefix, so that `192.168.1.77/24` and
 * `192.168.1.0/24` are held as the same range
 */
function mask(bytes, bits) {
  const out = new Uint8Array(bytes);
  for (let i = 0; i < out.length; i += 1) {
    const kept = Math.min(8, Math.max(0, bits - i * 8));
    out[i] &= kept === 0 ? 0 : (0xff << (8 - kept)) & 0xff;
  }
  return out;
}

/**
 * Checks if the ip address is in the range of allowed
 */
export function inRange(entry, bytes) {
  if (!bytes || bytes.length !== entry.bytes.length) return false;

  const whole = entry.bits >> 3;
  for (let i = 0; i < whole; i += 1) {
    if (bytes[i] !== entry.bytes[i]) return false;
  }

  const spare = entry.bits & 7;
  if (spare === 0) return true;

  const keep = (0xff << (8 - spare)) & 0xff;
  return (bytes[whole] & keep) === entry.bytes[whole];
}

/**
 * Checks if the ip address is in the range
 */
export function matchesAny(entries, ip) {
  if (!entries.length) return false;
  const bytes = toBytes(ip);
  return entries.some((entry) => inRange(entry, bytes));
}

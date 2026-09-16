/**
 * Captures that are waiting for the form to be saved.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const NAME = /^[0-9a-f]{32}\.png$/;

/**
 * Builds the store of pending captures.
 */
export function createTempShots({ uploadDir, ttlMinutes, now = () => Date.now() }) {
  const dir = path.join(uploadDir, "tmp");
  fs.mkdirSync(dir, { recursive: true });

  function isValidName(name) {
    return typeof name === "string" && NAME.test(name);
  }

  /**
   * Where a temporary file of that name lives.
   */
  function pathOf(name) {
    return path.join(dir, name);
  }

  /**
   * A fresh name. The file itself is written by the capture.
   */
  function reserve() {
    return `${crypto.randomBytes(16).toString("hex")}.png`;
  }

  /**
   * Moves a pending capture into the upload directory
   */
  function promote(name) {
    if (!isValidName(name)) return null;

    const from = pathOf(name);
    if (!fs.existsSync(from)) return null;

    const kept = `${crypto.randomBytes(16).toString("hex")}.png`;
    fs.renameSync(from, path.join(uploadDir, kept));
    return kept;
  }

  /**
   * Throws a pending capture away.
   */
  function remove(name) {
    if (!isValidName(name)) return;
    fs.rmSync(pathOf(name), { force: true });
  }

  /**
   * Clears out captures
   */
  function sweep() {
    const cutoff = now() - ttlMinutes * 60 * 1000;
    let removed = 0;

    for (const entry of fs.readdirSync(dir)) {
      if (!isValidName(entry)) continue;

      const file = path.join(dir, entry);
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }

      if (stat.mtimeMs >= cutoff) continue;

      fs.rmSync(file, { force: true });
      removed += 1;
    }

    return removed;
  }

  return { dir, isValidName, pathOf, reserve, promote, remove, sweep };
}

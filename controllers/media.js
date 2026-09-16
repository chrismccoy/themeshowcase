/**
 * Serves theme screenshots from the upload directory.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const PLACEHOLDER = fs.readFileSync(path.join(rootDir, "public", "img", "placeholder.svg"));

/**
 * How long a browser may keep a screenshot.
 */
const HIT_MAX_AGE_SECONDS = 300;

/**
 * How long a browser may keep the placeholder.
 */
const PLACEHOLDER_MAX_AGE_SECONDS = 60;

/**
 * Replies with the local placeholder.
 */
function sendPlaceholder(res) {
  res
    .status(200)
    .set("Content-Type", "image/svg+xml")
    .set("Cache-Control", `public, max-age=${PLACEHOLDER_MAX_AGE_SECONDS}`)
    .send(PLACEHOLDER);
}

/**
 * Builds the handler for `GET /media/tmp/:name`, the pending capture shown on
 * the form before it is saved.
 */
export function createTempMediaHandler({ tempShots }) {
  return function serveTempImage(req, res) {
    const name = String(req.params.name ?? "");

    if (!tempShots.isValidName(name)) {
      return res.status(404).set("Cache-Control", "no-store").type("txt").send("Not found");
    }

    res.set("Cache-Control", "no-store");

    return res.sendFile(tempShots.pathOf(name), (error) => {
      if (error && !res.headersSent) {
        res.status(404).set("Cache-Control", "no-store").type("txt").send("Not found");
      }
    });
  };
}

/**
 * Builds the handler for `GET /media/theme/:id`.
 */
export function createMediaHandler({ config, themes }) {
  const uploadDir = path.resolve(rootDir, config.uploadDir);

  return function serveThemeImage(req, res) {
    let imageFile;
    try {
      imageFile = themes.findImageFile(req.params.id);
    } catch {
      return sendPlaceholder(res);
    }

    if (!imageFile) {
      return res.status(404).set("Cache-Control", "no-store").type("txt").send("Not found");
    }

    const file = path.resolve(uploadDir, imageFile);
    if (!file.startsWith(`${uploadDir}${path.sep}`)) {
      return sendPlaceholder(res);
    }

    res.sendFile(file, { maxAge: HIT_MAX_AGE_SECONDS * 1000 }, (error) => {
      if (error && !res.headersSent) sendPlaceholder(res);
    });
  };
}

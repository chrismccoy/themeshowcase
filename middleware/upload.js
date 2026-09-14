/**
 * Reading an uploaded screenshot.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { imageTypeOf, SIGNATURE_BYTES } from "../lib/image-type.js";
import { humanBytes } from "../shared/bytes.js";
import { carriesCsrfToken } from "./csrf.js";

const FIELD = "image";

function firstBytes(file, count) {
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(count);
    const read = fs.readSync(handle, buffer, 0, count, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(handle);
  }
}

export function createUpload({ uploadDir, maxBytes }) {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError(
      `createUpload needs maxBytes, a positive whole number of bytes, received ${maxBytes}`
    );
  }

  fs.mkdirSync(uploadDir, { recursive: true });

  const limitText = humanBytes(maxBytes);

  const parser = multer({
    dest: uploadDir,
    limits: { fileSize: maxBytes, files: 1 },
  }).single(FIELD);

  function parse(req, res, next) {
    parser(req, res, (error) => {
      if (error) {
        req.uploadError =
          error.code === "LIMIT_FILE_SIZE"
            ? `That picture is larger than the ${limitText} limit.`
            : "That upload could not be read.";
      }
      next();
    });
  }

  function identify(req, res, next) {
    if (req.uploadError) return next();

    if (!req.file) {
      req.uploadError = "Please choose a screenshot.";
      return next();
    }

    const type = imageTypeOf(firstBytes(req.file.path, SIGNATURE_BYTES));
    if (!type) {
      req.uploadError = "That file is not a PNG, JPEG, WebP, AVIF or GIF picture.";
      return next();
    }

    req.uploadType = type;
    req.file.uploadExtension = type.extension;
    return next();
  }

  function verify(req, res, next) {
    if (carriesCsrfToken(req)) return next();
    discard(req.file);
    return res.status(403).type("txt").send("Request could not be verified. Please try again.");
  }

  function keep(file) {
    const name = `${crypto.randomBytes(16).toString("hex")}.${file.uploadExtension}`;
    fs.renameSync(file.path, path.join(uploadDir, name));
    return name;
  }

  function discard(file) {
    if (!file?.path) return;
    fs.rmSync(file.path, { force: true });
  }

  return { middleware: [parse, verify, identify], keep, discard };
}

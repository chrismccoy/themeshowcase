/**
 * Capturing a screenshot from a web address.
 */

import fs from "node:fs";
import { imageTypeOf, SIGNATURE_BYTES } from "../../lib/image-type.js";
import { humanBytes } from "../../shared/bytes.js";

/**
 * What the admin sees for a message
 */
function messageFor(code, limitText) {
  switch (code) {
    case "scheme":
      return "The address to capture must start with http or https.";
    case "private":
    case "redirect-private":
      return "That address points inside this server's own network, so it cannot be captured.";
    case "unresolvable":
    case "unreachable":
      return "That address could not be reached.";
    case "timeout":
      return "That site took too long to load. Try again, or upload a screenshot.";
    case "too-large":
      return `That screenshot came out larger than the ${limitText} limit.`;
    case "unreadable":
      return "That screenshot could not be read.";
    default:
      return "Screenshot generation is not available on this server.";
  }
}

/**
 * Reads the first bytes of a file, to name its format.
 */
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

/**
 * Builds the handler.
 */
export function createScreenshotController({
  guard,
  capture,
  tempShots,
  renderForm,
  maxImageBytes,
  themes,
}) {
  const limitText = humanBytes(maxImageBytes);

  /**
   * True when the caller wants JSON rather than a page.
   */
  function wantsJson(req) {
    return String(req.headers.accept ?? "").includes("application/json");
  }

  /**
   * Renders the theme form again
   */
  function renderPage(req, res, errors, generatedFile) {
    const id = String(req.body?.themeId ?? "").trim();
    const theme = id ? themes.findById(id) : null;

    return renderForm(res, {
      title: theme ? "Edit theme" : "Add theme",
      action: theme ? `/admin/themes/${theme.id}` : "/admin/themes",
      values: {
        title: String(req.body?.title ?? ""),
        url: String(req.body?.url ?? ""),
        categoryId: req.body?.categoryId ?? "",
        description: String(req.body?.description ?? ""),
        mode: "generate",
        captureUrl: String(req.body?.captureUrl ?? ""),
        generatedFile,
        themeId: theme ? String(theme.id) : "",
      },
      errors,
      currentImage: generatedFile
        ? `/media/tmp/${generatedFile}`
        : theme
          ? `/media/theme/${theme.id}`
          : null,
    });
  }

  /**
   * Refuses
   */
  function refuse(req, res, code) {
    const error = messageFor(code, limitText);
    if (wantsJson(req)) return res.status(422).json({ ok: false, error });
    return renderPage(req, res, [error], "");
  }

  /**
   * Captures one address.
   */
  return async function shoot(req, res) {
    tempShots.sweep();

    const previous = String(req.body?.generatedFile ?? "");
    if (tempShots.isValidName(previous)) tempShots.remove(previous);

    const checked = await guard.check(req.body?.captureUrl);
    if (!checked.ok) return refuse(req, res, checked.reason);

    const name = tempShots.reserve();
    const file = tempShots.pathOf(name);

    try {
      await capture(checked.url, tempShots.dir, name);
    } catch (error) {
      tempShots.remove(name);
      return refuse(req, res, error?.code ?? "engine");
    }

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return refuse(req, res, "engine");
    }

    if (stat.size > maxImageBytes) {
      tempShots.remove(name);
      return refuse(req, res, "too-large");
    }

    if (!imageTypeOf(firstBytes(file, SIGNATURE_BYTES))) {
      tempShots.remove(name);
      return refuse(req, res, "unreadable");
    }

    if (wantsJson(req)) {
      return res.json({ ok: true, generatedFile: name, preview: `/media/tmp/${name}` });
    }

    return renderPage(req, res, [], name);
  };
}

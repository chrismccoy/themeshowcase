/**
 * The themes listing, the form, and saving
 */

import fs from "node:fs";
import path from "node:path";
import { createThemeFormView } from "./theme-form-view.js";

/**
 * Keeps only an address this app is allowed to send to
 */
function httpUrl(value) {
  try {
    const { protocol } = new URL(String(value));
    return protocol === "http:" || protocol === "https:" ? String(value) : null;
  } catch {
    return null;
  }
}

const DESCRIPTION_LIMIT = 300;

/**
 * Builds the handlers.
 */
export function createThemesController({
  themes,
  categories,
  flash,
  upload,
  uploadDir,
  maxImageBytes,
  screenshotEnabled,
  tempShots,
}) {
  const renderForm = createThemeFormView({ categories, maxImageBytes, screenshotEnabled });

  /**
   * Removes a stored screenshot, if it is still there.
   */
  function removeFile(name) {
    if (!name) return;
    fs.rmSync(path.join(uploadDir, name), { force: true });
  }

  /**
   * Sends the admin back to the list
   */
  function back(res, message, kind = "ok") {
    if (message) res.append("Set-Cookie", flash.setCookieHeader(message, kind));
    return res.redirect("/admin/themes");
  }

  /**
   * Checks a submitted form
   */
  function check(body) {
    const errors = [];

    const title = String(body?.title ?? "").trim();
    if (!title) errors.push("A theme needs a title.");

    const url = httpUrl(body?.url);
    if (!url) errors.push("The demo address must start with http or https.");

    const categoryId = Number(body?.categoryId);
    if (!Number.isInteger(categoryId) || !categories.findById(categoryId)) {
      errors.push("Pick a category that exists.");
    }

    const description = String(body?.description ?? "").trim();
    if (description.length > DESCRIPTION_LIMIT) {
      errors.push(`The description must be ${DESCRIPTION_LIMIT} characters or fewer.`);
    }

    return {
      errors,
      values: {
        title,
        url: url ?? String(body?.url ?? ""),
        categoryId,
        description,
        mode: body?.mode === "generate" ? "generate" : "upload",
        captureUrl: String(body?.captureUrl ?? ""),
        generatedFile: String(body?.generatedFile ?? ""),
        themeId: String(body?.themeId ?? ""),
      },
    };
  }

  /**
   * Turns the chosen way of getting a picture into a stored file name.
   */
  function screenshotFor(values, req, { required }) {
    if (values.mode === "generate") {
      upload.discard(req.file);

      const kept = tempShots.promote(values.generatedFile);
      if (kept) return { imageFile: kept, error: null };

      return {
        imageFile: undefined,
        error: required
          ? "Generate a screenshot before saving, or switch back to uploading one."
          : null,
      };
    }

    if (req.file && req.uploadType) return { imageFile: upload.keep(req.file), error: null };
    return { imageFile: undefined, error: null };
  }

  /**
   * The list.
   */
  function list(req, res) {
    res.locals.active = "themes";
    const confirmId = Number(req.query.confirm);

    return res.render("admin/themes", {
      title: "Themes",
      themes: themes.list(),
      confirmId: Number.isInteger(confirmId) ? confirmId : null,
    });
  }

  /**
   * The empty form.
   */
  function newForm(req, res) {
    return renderForm(res, {
      title: "Add theme",
      action: "/admin/themes",
      values: { title: "", url: "", categoryId: categories.list()[0]?.id ?? "", description: "" },
      errors: [],
      currentImage: null,
    });
  }

  /**
   * Adds a theme.
   */
  function create(req, res) {
    const { errors, values } = check(req.body);
    if (req.uploadError && values.mode !== "generate") errors.push(req.uploadError);

    if (errors.length) {
      upload.discard(req.file);
      return renderForm(res, {
        title: "Add theme",
        action: "/admin/themes",
        values,
        errors,
        currentImage: null,
      });
    }

    const picture = screenshotFor(values, req, { required: true });

    if (picture.error || !picture.imageFile) {
      return renderForm(res, {
        title: "Add theme",
        action: "/admin/themes",
        values,
        errors: [picture.error ?? "A theme needs a screenshot."],
        currentImage: null,
      });
    }

    const imageFile = picture.imageFile;

    try {
      themes.create({ ...values, imageFile });
    } catch {
      removeFile(imageFile);
      return renderForm(res, {
        title: "Add theme",
        action: "/admin/themes",
        values,
        errors: ["That theme could not be saved."],
        currentImage: null,
      });
    }

    return back(res, `Theme ${values.title} added.`);
  }

  /**
   * The form, filled in.
   */
  function editForm(req, res) {
    const theme = themes.findById(req.params.id);
    if (!theme) return res.status(404).type("txt").send("Not found");

    return renderForm(res, {
      title: "Edit theme",
      action: `/admin/themes/${theme.id}`,
      values: {
        title: theme.title,
        url: theme.url,
        categoryId: theme.categoryId,
        description: theme.description,
        themeId: String(theme.id),
      },
      errors: [],
      currentImage: `/media/theme/${theme.id}`,
    });
  }

  /**
   * Changes a theme, with or without a new screenshot.
   */
  function update(req, res) {
    const theme = themes.findById(req.params.id);
    if (!theme) {
      upload.discard(req.file);
      return back(res, "That theme no longer exists.", "warn");
    }

    const { errors, values } = check(req.body);

    if (
      req.uploadError &&
      req.uploadError !== "Please choose a screenshot." &&
      values.mode !== "generate"
    ) {
      errors.push(req.uploadError);
    }

    if (errors.length) {
      upload.discard(req.file);
      return renderForm(res, {
        title: "Edit theme",
        action: `/admin/themes/${theme.id}`,
        values,
        errors,
        currentImage: `/media/theme/${theme.id}`,
      });
    }

    const picture = screenshotFor(values, req, { required: false });

    if (picture.error) {
      return renderForm(res, {
        title: "Edit theme",
        action: `/admin/themes/${theme.id}`,
        values,
        errors: [picture.error],
        currentImage: `/media/theme/${theme.id}`,
      });
    }

    const imageFile = picture.imageFile;

    themes.update(theme.id, { ...values, imageFile });

    if (imageFile) removeFile(theme.imageFile);

    return back(res, `Theme ${values.title} saved.`);
  }

  /**
   * Deletes a theme and its screenshot.
   */
  function remove(req, res) {
    const theme = themes.findById(req.params.id);
    if (!theme) return back(res, "That theme no longer exists.", "warn");

    const file = themes.remove(theme.id);
    removeFile(file);

    return back(res, `Theme ${theme.title} deleted.`);
  }

  /**
   * Moves a theme one place up or down.
   */
  function move(req, res) {
    const direction = String(req.body?.direction ?? "");
    if (direction === "up") themes.moveUp(req.params.id);
    else if (direction === "down") themes.moveDown(req.params.id);

    return res.redirect("/admin/themes");
  }

  return { list, newForm, create, editForm, update, remove, move };
}

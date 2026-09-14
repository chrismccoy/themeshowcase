/**
 * The themes listing, the form, and saving
 */

import fs from "node:fs";
import path from "node:path";
import { humanBytes } from "../../shared/bytes.js";

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
}) {
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
      values: { title, url: url ?? String(body?.url ?? ""), categoryId, description },
    };
  }

  /**
   * Renders the form
   */
  function renderForm(res, { action, values, errors, currentImage, title }) {
    res.locals.active = "themes";
    return res.render("admin/theme-form", {
      title,
      action,
      values,
      errors,
      currentImage,
      categories: categories.list(),
      maxImageBytes,
      maxImageText: humanBytes(maxImageBytes),
    });
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
    if (req.uploadError) errors.push(req.uploadError);

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

    const imageFile = upload.keep(req.file);

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

    if (req.uploadError && req.uploadError !== "Please choose a screenshot.") {
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

    const replacing = Boolean(req.file && req.uploadType);
    const imageFile = replacing ? upload.keep(req.file) : undefined;

    themes.update(theme.id, { ...values, imageFile });

    if (replacing) removeFile(theme.imageFile);

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

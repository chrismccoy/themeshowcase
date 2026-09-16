/**
 * Rendering the add and edit theme form, for every route that needs it.
 */

import { humanBytes } from "../../shared/bytes.js";

/**
 * Builds the renderer.
 */
export function createThemeFormView({ categories, maxImageBytes, screenshotEnabled }) {
  return function renderForm(res, { action, values, errors, currentImage, title }) {
    res.locals.active = "themes";

    return res.render("admin/theme-form", {
      title,
      action,
      values: {
        mode: "upload",
        captureUrl: "",
        generatedFile: "",
        themeId: "",
        ...values,
      },
      errors,
      currentImage,
      categories: categories.list(),
      maxImageBytes,
      maxImageText: humanBytes(maxImageBytes),
      screenshotEnabled,
    });
  };
}

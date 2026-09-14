/**
 * The categories listing, adding, renaming and deleting.
 */

/**
 * Failed message
 */
function messageFor(error, name) {
  if (String(error.message).includes("UNIQUE")) {
    return `A category called ${name} already exists.`;
  }
  return "That could not be saved.";
}

/**
 * Builds the handlers.
 */
export function createCategoriesController({ categories, flash }) {
  /**
   * Sends the administrator back to the list
   */
  function back(res, message, kind = "ok") {
    if (message) res.append("Set-Cookie", flash.setCookieHeader(message, kind));
    return res.redirect("/admin/categories");
  }

  /**
   * The list
   */
  function list(req, res) {
    res.locals.active = "categories";
    const confirmId = Number(req.query.confirm);

    return res.render("admin/categories", {
      title: "Categories",
      categories: categories.list(),
      confirmId: Number.isInteger(confirmId) ? confirmId : null,
    });
  }

  /**
   * Adds a category.
   */
  function create(req, res) {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return back(res, "A category needs a name.", "warn");

    try {
      categories.create(name);
    } catch (error) {
      return back(res, messageFor(error, name), "warn");
    }

    return back(res, `Category ${name} added.`);
  }

  /**
   * Renames a category.
   */
  function rename(req, res) {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return back(res, "A category needs a name.", "warn");

    if (!categories.findById(req.params.id)) return back(res, "That category no longer exists.", "warn");

    try {
      categories.rename(req.params.id, name);
    } catch (error) {
      return back(res, messageFor(error, name), "warn");
    }

    return back(res, `Category renamed to ${name}.`);
  }

  /**
   * Deletes a category, unless it still holds themes.
   */
  function remove(req, res) {
    const category = categories.findById(req.params.id);
    if (!category) return back(res, "That category no longer exists.", "warn");

    const held = categories.list().find((row) => row.id === category.id)?.count ?? 0;
    if (held > 0) {
      return back(
        res,
        `${category.name} still holds ${held} ${held === 1 ? "theme" : "themes"}. Move or delete them first.`,
        "warn"
      );
    }

    try {
      categories.remove(category.id);
    } catch {
      return back(res, `${category.name} could not be deleted.`, "warn");
    }

    return back(res, `Category ${category.name} deleted.`);
  }

  return { list, create, rename, remove };
}

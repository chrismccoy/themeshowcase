/**
 * Renders the previewer page.
 */

import { createStore, selectActive, selectCategories } from "../shared/store.js";
import { buildCounters, buildRowsHtml } from "../shared/view-model.js";
import { themeItem, categoryPill } from "../shared/templates.js";
import { safeJson } from "../utils/safe-json.js";

/**
 * Builds the handler for `GET /`.
 */
export function createPreviewerHandler({ config, themes }) {
  return function renderPreviewer(req, res) {
    let rows;
    try {
      rows = themes.list();
    } catch {
      res.status(503).set("Cache-Control", "no-store");
      return res.render("error", { nonce: res.locals.nonce });
    }

    const state = createStore({ themes: rows }).getState();

    res.set("Cache-Control", "no-store");
    res.render("index", {
      nonce: res.locals.nonce,
      links: config.navLinks,
      total: rows.length,
      active: selectActive(state),
      counters: buildCounters(state),
      fallbackImage: config.fallbackImage,
      rowsHtml: buildRowsHtml(state, themeItem),
      pillsHtml: selectCategories(state).map(categoryPill).join(""),
      stateJson: safeJson(rows),
    });
  };
}

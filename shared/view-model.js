/**
 * Gets the text shown in the counters and the navigation buttons.
 */

import {
  ALL,
  selectFiltered,
  selectActive,
  selectActiveIndex,
  selectRows,
} from "./store.js";

export const EMPTY_ROWS_HTML = '<li class="list-empty">No themes found</li>';

/**
 * Prints what the page is showing
 */
function showingText(state, filtered) {
  if (!filtered.length) return "Showing no themes";
  if (state.category === ALL && !state.query) return "Showing every theme";
  if (filtered.length === 1) return "Showing one theme";
  return `Showing ${filtered.length} themes`;
}

/**
 * Builds the counter text and button values
 */
export function buildCounters(state) {
  const filtered = selectFiltered(state);
  const active = selectActive(state);
  const index = selectActiveIndex(state);

  return {
    progress: active ? `${index + 1} of ${filtered.length}` : "0 of 0",
    meta: showingText(state, filtered),
    label: active ? active.name : "",
    hasPrev: index > 0,
    hasNext: index > -1 && index < filtered.length - 1,
  };
}

/**
 * Renders the list rows
 */
export function buildRowsHtml(state, renderItem) {
  const rows = selectRows(state);
  if (!rows.length) return EMPTY_ROWS_HTML;
  return rows.map(renderItem).join("");
}

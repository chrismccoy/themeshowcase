/**
 * The row and pill markup
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#34;", "'": "&#39;" };

/**
 * Escapes a value for HTML.
 */
export function escapeHtml(value) {
  return value === undefined || value === null
    ? ""
    : String(value).replace(/[&<>'"]/g, (c) => ESCAPES[c]);
}

/**
 * Renders one list row.
 */
export function themeItem({ theme, isActive }) {
  const e = escapeHtml;
  const thumb = theme.image
    ? `<img class="thumb" src="${e(theme.image)}" alt="" loading="lazy" />`
    : '<span class="thumb"></span>';

  return (
    `<li id="theme-${e(theme.id)}" role="option" aria-selected="${isActive ? "true" : "false"}"` +
    ` data-id="${e(theme.id)}" tabindex="-1" class="theme-row">` +
    thumb +
    '<span class="min-w-0 flex-1">' +
    `<span class="name">${e(theme.name)}</span>` +
    `<span class="cat">${e(theme.category)}</span>` +
    "</span></li>"
  );
}

/**
 * Renders one category pill.
 */
export function categoryPill({ name, count, isActive, disabled }) {
  const e = escapeHtml;
  return (
    `<button type="button" data-cat="${e(name)}" aria-pressed="${isActive ? "true" : "false"}"` +
    `${disabled ? " disabled" : ""} class="btn btn-sm btn-filter">${e(name)} ` +
    `<span class="count">${e(count)}</span></button>`
  );
}

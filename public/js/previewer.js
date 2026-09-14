/**
 * Adds DOM events to store actions and the renderer.
 */

import { createStore, selectActive } from "../../shared/store.js";
import { createRenderer } from "./render.js";

function parseThemes(stateEl) {
  if (!stateEl) return [];
  try {
    const parsed = JSON.parse(stateEl.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function startPreviewer({ root, win, fallbackImage, clipboard = win.navigator?.clipboard }) {
  const themes = parseThemes(root.getElementById("__THEMES__"));

  const store = createStore({ themes });
  const render = createRenderer({ root, fallbackImage });

  store.subscribe(render);

  const list = root.getElementById("theme-list");
  const pills = root.getElementById("pill-filters");
  const search = root.getElementById("search");
  const image = root.getElementById("preview-image");

  list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) store.dispatch({ type: "SELECT", id: row.dataset.id });
  });

  pills.addEventListener("click", (event) => {
    const pill = event.target.closest("[data-cat]");
    if (pill) store.dispatch({ type: "SET_CATEGORY", category: pill.dataset.cat });
  });

  search.addEventListener("input", (event) => {
    store.dispatch({ type: "SET_QUERY", query: event.target.value });
  });

  root.getElementById("prev-btn").addEventListener("click", () => store.dispatch({ type: "PREV" }));
  root.getElementById("next-btn").addEventListener("click", () => store.dispatch({ type: "NEXT" }));

  const copyButton = root.getElementById("copy-link");
  const copyLabel = root.getElementById("copy-link-label");
  let copyTimer = null;

  copyButton.addEventListener("click", () => {
    const url = copyButton.dataset.url;
    if (!url || !clipboard) return;

    Promise.resolve(clipboard.writeText(url)).then(
      () => {
        clearTimeout(copyTimer);
        copyLabel.textContent = "Copied";
        copyTimer = setTimeout(() => {
          copyLabel.textContent = "Copy link";
        }, 1500);
      },
      () => {}
    );
  });

  function onKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      store.dispatch({ type: "NEXT" });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      store.dispatch({ type: "PREV" });
      return;
    }
    if (event.key === "Enter" && event.target !== search) {
      const active = selectActive(store.getState());
      if (active?.url) win.open(active.url, "_blank", "noopener,noreferrer");
    }
  }

  list.addEventListener("keydown", onKeydown);
  search.addEventListener("keydown", onKeydown);

  image.addEventListener("error", () => {
    const fallback = image.dataset.fallback || fallbackImage;
    if (image.getAttribute("src") !== fallback) image.setAttribute("src", fallback);
  });

  return store;
}

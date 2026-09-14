import {
  selectFiltered,
  selectActive,
  selectCategories,
  selectRows,
} from "../../shared/store.js";
import { buildCounters, EMPTY_ROWS_HTML } from "../../shared/view-model.js";
import { themeItem, categoryPill } from "../../shared/templates.js";

const DEFAULT_TEMPLATES = { themeItem, categoryPill };

const idsOf = (themes) => themes.map((t) => t.id).join("|");

export function createRenderer({ root, templates = DEFAULT_TEMPLATES, fallbackImage, transitionMs }) {
  const els = {
    list: root.getElementById("theme-list"),
    pills: root.getElementById("pill-filters"),
    meta: root.getElementById("filter-meta"),
    progress: root.getElementById("progress"),
    navCount: root.getElementById("nav-count"),
    heroCount: root.getElementById("hero-count"),
    browserUrl: root.getElementById("browser-url"),
    browserLink: root.getElementById("browser-url-link"),
    browserIcon: root.getElementById("browser-url-icon"),
    demoChip: root.getElementById("demo-chip"),
    demoChipText: root.getElementById("demo-chip-text"),
    openDemo: root.getElementById("open-demo"),
    copyLink: root.getElementById("copy-link"),
    image: root.getElementById("preview-image"),
    label: root.getElementById("preview-label"),
    category: root.getElementById("preview-cat"),
    description: root.getElementById("preview-description"),
    bar: root.getElementById("loading-bar"),
    prev: root.getElementById("prev-btn"),
    next: root.getElementById("next-btn"),
  };

  const duration = (() => {
    if (Number.isFinite(transitionMs)) return transitionMs;
    const declared = Number(els.image?.dataset?.transitionMs);
    return Number.isFinite(declared) && declared > 0 ? declared : 180;
  })();

  const renderItem = (locals) => templates.themeItem(locals);

  const renderPill = (locals) => templates.categoryPill(locals);

  let transitionTimer = null;

  function paintPreview(active) {
    els.browserUrl.textContent = active ? active.url : "";
    paintDemoLinks(active);
    els.category.textContent = active ? active.category : "";
    els.description.textContent = active ? (active.description ?? "") : "";
    els.image.setAttribute("src", active ? active.image || fallbackImage : fallbackImage);
    els.image.setAttribute("alt", active ? active.name : "");
  }

  function paintDemoLinks(active) {
    const url = active ? active.url : "";

    if (url) {
      els.browserLink.setAttribute("href", url);
      els.browserLink.setAttribute("target", "_blank");
      els.browserLink.setAttribute("rel", "noopener noreferrer");
      els.browserLink.setAttribute("aria-label", `Open the ${active.name} demo in a new tab`);
      els.demoChip.setAttribute("href", url);
      els.demoChip.setAttribute("target", "_blank");
      els.demoChip.setAttribute("rel", "noopener noreferrer");
      els.openDemo.setAttribute("href", url);
      els.openDemo.setAttribute("target", "_blank");
      els.openDemo.setAttribute("rel", "noopener noreferrer");
    } else {
      for (const el of [els.browserLink, els.demoChip, els.openDemo]) {
        el.removeAttribute("href");
        el.removeAttribute("target");
        el.removeAttribute("rel");
      }
      els.browserLink.removeAttribute("aria-label");
    }

    els.demoChipText.textContent = url.replace(/^https?:\/\//, "");
    els.copyLink.dataset.url = url;

    els.browserIcon.classList.toggle("hidden", !url);
    for (const el of [els.demoChip, els.openDemo, els.copyLink]) {
      el.classList.toggle("hidden", !url);
    }
  }

  function transitionPreview(active, counters) {
    clearTimeout(transitionTimer);
    els.bar.style.opacity = "1";
    els.bar.style.width = "35%";
    els.image.style.opacity = "0.6";

    transitionTimer = setTimeout(() => {
      paintPreview(active);
      els.label.textContent = counters.label;
      els.image.style.opacity = "1";
      els.bar.style.width = "100%";
      transitionTimer = setTimeout(() => {
        els.bar.style.opacity = "0";
        els.bar.style.width = "0%";
      }, duration);
    }, duration);
  }

  return function render(state, prev) {
    const filtered = selectFiltered(state);
    const active = selectActive(state);
    const counters = buildCounters(state);

    const listChanged =
      !prev ||
      state.activeId !== prev.activeId ||
      (filtered !== selectFiltered(prev) && idsOf(filtered) !== idsOf(selectFiltered(prev)));

    if (listChanged) {
      els.list.innerHTML = filtered.length
        ? selectRows(state).map(renderItem).join("")
        : EMPTY_ROWS_HTML;

      if (active) {
        els.list.setAttribute("aria-activedescendant", `theme-${active.id}`);
        const row = [...els.list.children].find((el) => el.dataset.id === active.id);
        if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
      } else {
        els.list.removeAttribute("aria-activedescendant");
      }
    }

    if (
      !prev ||
      state.category !== prev.category ||
      state.query !== prev.query ||
      state.themes !== prev.themes
    ) {
      els.pills.innerHTML = selectCategories(state).map(renderPill).join("");
    }

    els.meta.textContent = counters.meta;
    els.progress.textContent = counters.progress;
    els.navCount.textContent = `${state.themes.length} themes`;
    els.heroCount.textContent = String(state.themes.length);
    els.prev.disabled = !counters.hasPrev;
    els.next.disabled = !counters.hasNext;

    if (!prev) {
      paintPreview(active);
      els.label.textContent = counters.label;
    } else if (state.activeId !== prev.activeId) {
      transitionPreview(active, counters);
    }
  };
}

/**
 * Tests for the state container.
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  createStore,
  selectFiltered,
  selectRows,
  selectCategories,
  selectActive,
  selectActiveIndex,
} from "../shared/store.js";
import { buildCounters } from "../shared/view-model.js";

const THEMES = [
  { id: "aurora", name: "Aurora", category: "Blog", image: "", url: "https://aurora.test" },
  { id: "basalt", name: "Basalt", category: "Portfolio", image: "", url: "" },
  { id: "cinder", name: "Cinder", category: "Blog", image: "", url: "" },
];

const store = (overrides = {}) => createStore({ themes: THEMES, ...overrides });

describe("createStore", () => {
  it("selects the first theme when no active id is supplied", () => {
    assert.equal(store().getState().activeId, "aurora");
  });

  it("has a null active id when there are no themes", () => {
    assert.equal(createStore({ themes: [] }).getState().activeId, null);
  });

  it("notifies subscribers when the state changes", () => {
    const s = store();
    const listener = mock.fn();
    s.subscribe(listener);
    s.dispatch({ type: "SELECT", id: "basalt" });
    assert.equal(listener.mock.callCount(), 1);
  });

  it("does not notify subscribers when an action changes nothing", () => {
    const s = store();
    const listener = mock.fn();
    s.subscribe(listener);
    s.dispatch({ type: "SELECT", id: "aurora" });
    assert.equal(listener.mock.callCount(), 0);
  });

  it("ignores a selection of an unknown id", () => {
    const s = store();
    s.dispatch({ type: "SELECT", id: "nope" });
    assert.equal(s.getState().activeId, "aurora");
  });
});

describe("filtering", () => {
  it("matches the query against the name", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "bas" });
    assert.deepEqual(selectFiltered(s.getState()).map((t) => t.id), ["basalt"]);
  });

  it("matches the query against the category, ignoring case", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "BLOG" });
    assert.deepEqual(selectFiltered(s.getState()).map((t) => t.id), ["aurora", "cinder"]);
  });

  it("restricts results to the chosen category", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Portfolio" });
    assert.deepEqual(selectFiltered(s.getState()).map((t) => t.id), ["basalt"]);
  });

  it("returns every theme under the All category", () => {
    assert.equal((selectFiltered(store().getState())).length, 3);
  });

  it("returns the same array reference for repeated calls with unchanged inputs", () => {
    const state = store().getState();
    assert.equal(selectFiltered(state), selectFiltered(state));
  });

  it("keeps a separate result per state, so interleaved reads do not evict each other", () => {
    const a = store().getState();
    const b = createStore({ themes: THEMES.slice(0, 2) }).getState();
    const first = selectFiltered(a);
    selectFiltered(b);
    assert.equal(selectFiltered(a), first);
  });

  it("carries the filter result across a selection change", () => {
    const s = store();
    const before = selectFiltered(s.getState());
    s.dispatch({ type: "NEXT" });
    assert.equal(selectFiltered(s.getState()), before);
  });

  it("recomputes the filter when the query changes", () => {
    const s = store();
    const before = selectFiltered(s.getState());
    s.dispatch({ type: "SET_QUERY", query: "bas" });
    assert.notEqual(selectFiltered(s.getState()), before);
  });
});

describe("the active id stays inside the filtered set", () => {
  it("moves to the first match when the query excludes the active theme", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "cinder" });
    assert.equal(s.getState().activeId, "cinder");
  });

  it("becomes null when the query matches nothing", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "zzz" });
    assert.equal(s.getState().activeId, null);
  });

  it("moves to the first match when the category excludes the active theme", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Portfolio" });
    assert.equal(s.getState().activeId, "basalt");
  });

  it("keeps the active theme when it survives the filter", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    assert.equal(s.getState().activeId, "aurora");
  });

  it("restores a selection when the query is cleared", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "zzz" });
    s.dispatch({ type: "SET_QUERY", query: "" });
    assert.equal(s.getState().activeId, "aurora");
  });

  it("refuses to select a theme hidden by the current filter", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Portfolio" });
    s.dispatch({ type: "SELECT", id: "aurora" });
    assert.equal(s.getState().activeId, "basalt");
  });
});

describe("NEXT and PREV", () => {
  it("advances to the following theme", () => {
    const s = store();
    s.dispatch({ type: "NEXT" });
    assert.equal(s.getState().activeId, "basalt");
  });

  it("stops at the end of the list", () => {
    const s = store();
    s.dispatch({ type: "SELECT", id: "cinder" });
    s.dispatch({ type: "NEXT" });
    assert.equal(s.getState().activeId, "cinder");
  });

  it("stops at the start of the list", () => {
    const s = store();
    s.dispatch({ type: "PREV" });
    assert.equal(s.getState().activeId, "aurora");
  });

  it("steps through the filtered set rather than every theme", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    s.dispatch({ type: "NEXT" });
    assert.equal(s.getState().activeId, "cinder");
  });

  it("does nothing when the filtered set is empty", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "zzz" });
    s.dispatch({ type: "NEXT" });
    assert.equal(s.getState().activeId, null);
  });
});

describe("selectors", () => {
  it("marks the active row", () => {
    const rows = selectRows(store().getState());
    assert.deepEqual(rows.filter((r) => r.isActive).map((r) => r.theme.id), ["aurora"]);
  });

  it("lists categories with counts and All first", () => {
    assert.deepEqual(selectCategories(store().getState()), [
      { name: "All", count: 3, isActive: true, disabled: false },
      { name: "Blog", count: 2, isActive: false, disabled: false },
      { name: "Portfolio", count: 1, isActive: false, disabled: false },
    ]);
  });

  it("counts what the search leaves, not what the library holds", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "aurora" });
    assert.deepEqual(selectCategories(s.getState()), [
      { name: "All", count: 1, isActive: true, disabled: false },
      { name: "Blog", count: 1, isActive: false, disabled: false },
      { name: "Portfolio", count: 0, isActive: false, disabled: true },
    ]);
  });

  it("counts a category the same whichever category is chosen", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    assert.deepEqual(
      selectCategories(s.getState()).map((c) => c.count),
      [3, 2, 1]
    );
  });

  it("labels the preview with the theme's name alone", () => {
    const s = store();
    s.dispatch({ type: "SELECT", id: "basalt" });
    assert.equal(buildCounters(s.getState()).label, "Basalt");
  });

  it("returns the active theme", () => {
    assert.equal(selectActive(store().getState()).id, "aurora");
  });

  it("reports the active position within the filtered set", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    s.dispatch({ type: "NEXT" });
    assert.equal(selectActiveIndex(s.getState()), 1);
  });

  it("reports minus one when nothing is active", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "zzz" });
    assert.equal(selectActiveIndex(s.getState()), -1);
  });
});

describe("searching descriptions", () => {
  const described = () =>
    createStore({
      themes: [
        { id: "1", name: "Aurora", category: "Blog", url: "", image: "", description: "A spare theme for long reads." },
        { id: "2", name: "Basalt", category: "Portfolio", url: "", image: "", description: "Dense and dark." },
      ],
    });

  it("finds a theme by a word only its description carries", () => {
    const s = described();
    s.dispatch({ type: "SET_QUERY", query: "dense" });
    assert.deepEqual(
      selectFiltered(s.getState()).map((theme) => theme.name),
      ["Basalt"]
    );
  });

  it("still finds a theme by name and by category", () => {
    const s = described();
    s.dispatch({ type: "SET_QUERY", query: "aurora" });
    assert.deepEqual(selectFiltered(s.getState()).map((theme) => theme.name), ["Aurora"]);

    s.dispatch({ type: "SET_QUERY", query: "portfolio" });
    assert.deepEqual(selectFiltered(s.getState()).map((theme) => theme.name), ["Basalt"]);
  });

  it("copes with a theme that has no description", () => {
    const s = createStore({
      themes: [{ id: "1", name: "Aurora", category: "Blog", url: "", image: "" }],
    });
    s.dispatch({ type: "SET_QUERY", query: "aurora" });
    assert.equal(selectFiltered(s.getState()).length, 1);
  });
});

describe("the showing line", () => {
  it("says every theme when nothing is filtered", () => {
    assert.equal(buildCounters(store().getState()).meta, "Showing every theme");
  });

  it("counts what a category leaves", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    assert.equal(buildCounters(s.getState()).meta, "Showing 2 themes");
  });

  it("counts what a search leaves", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "aurora" });
    assert.equal(buildCounters(s.getState()).meta, "Showing one theme");
  });

  it("says so when nothing is left", () => {
    const s = store();
    s.dispatch({ type: "SET_QUERY", query: "zzz" });
    assert.equal(buildCounters(s.getState()).meta, "Showing no themes");
  });
});

describe("searching inside a category", () => {
  it("falls back to every theme when the search empties the chosen category", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Portfolio" });
    s.dispatch({ type: "SET_QUERY", query: "cinder" });
    assert.equal(s.getState().category, "All");
    assert.deepEqual(
      selectFiltered(s.getState()).map((theme) => theme.name),
      ["Cinder"]
    );
  });

  it("stays in the chosen category while the search still leaves something", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    s.dispatch({ type: "SET_QUERY", query: "cinder" });
    assert.equal(s.getState().category, "Blog");
  });

  it("leaves the category alone when nothing matches anywhere", () => {
    const s = store();
    s.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    s.dispatch({ type: "SET_QUERY", query: "zzz" });
    assert.equal(s.getState().category, "Blog");
    assert.equal(buildCounters(s.getState()).meta, "Showing no themes");
  });
});

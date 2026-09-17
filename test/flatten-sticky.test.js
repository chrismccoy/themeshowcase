/**
 * Tests for the script that keeps the sticky nav bars before a whole-page capture.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FLATTEN_STICKY } from "../lib/flatten-sticky.js";
import { installDom } from "./helpers/dom.js";

const PAGE = `
<body>
  <header id="bar" style="position: fixed; display: flex">menu</header>
  <nav id="rail" style="position: sticky">links</nav>
  <main id="body" style="position: static">words</main>
  <aside id="badge" style="position: absolute">sale</aside>
</body>`;

let window;

function drawnAt(id, width) {
  Object.defineProperty(window.document.getElementById(id), "offsetWidth", {
    value: width,
    configurable: true,
  });
}

function run() {
  window = installDom(PAGE);
  drawnAt("bar", 900);
  window.eval(FLATTEN_STICKY);
  return window.document;
}

describe("FLATTEN_STICKY", () => {
  beforeEach(run);

  it("lets a fixed bar flow with the page", () => {
    assert.equal(document.getElementById("bar").style.position, "relative");
  });

  it("lets a sticky rail flow with the page", () => {
    assert.equal(document.getElementById("rail").style.position, "relative");
  });

  it("holds a flattened bar at the width it was drawn", () => {
    assert.equal(document.getElementById("bar").style.width, "900px");
  });

  it("leaves the width alone on a bar the page never drew", () => {
    assert.equal(document.getElementById("rail").style.width, "");
  });

  it("keeps a flex bar's contents centred once it flows", () => {
    assert.equal(document.getElementById("bar").style.justifyContent, "center");
  });

  it("leaves everything else where the page put it", () => {
    assert.equal(document.getElementById("body").style.position, "static");
    assert.equal(document.getElementById("badge").style.position, "absolute");
  });
});

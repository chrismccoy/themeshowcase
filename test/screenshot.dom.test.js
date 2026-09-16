/**
 * Tests for the generate control on the theme form.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.js";
import { startScreenshot } from "../public/js/screenshot.js";

const form = ({ required = true } = {}) => `
<form action="/admin/themes" method="post" enctype="multipart/form-data">
  <div class="mode-switch">
    <label class="mode-choice"><input id="mode-upload" class="sr-only" type="radio" name="mode" value="upload" checked />Upload a picture</label>
    <label class="mode-choice"><input id="mode-generate" class="sr-only" type="radio" name="mode" value="generate" />Generate from a web address</label>
  </div>
  <div id="generate-panel" class="hidden">
    <input id="capture-url" name="captureUrl" type="url" value="https://aurora.test" />
    <button id="generate-button" type="submit" formaction="/admin/themes/screenshot">Generate</button>
    <img id="capture-preview" class="drop-preview hidden" />
  </div>
  <input id="generated-file" type="hidden" name="generatedFile" value="" />
  <div id="upload-panel">
    <div id="drop-zone"><input id="image" name="image" type="file" ${required ? "required" : ""} /><img id="drop-preview" class="hidden" /></div>
  </div>
  <p id="drop-error" class="hidden"><span id="drop-error-text"></span></p>
</form>`;

function mount({ reply, sent = [], required = true } = {}) {
  const window = installDom(`<body>${form({ required })}</body>`);

  window.fetch = async (url, options) => {
    sent.push({ url, options });
    return { json: async () => reply };
  };

  startScreenshot({ root: window.document, win: window });
  return window;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startScreenshot", () => {
  it("shows the panel when generate is chosen, and hides it again", () => {
    const window = mount({ reply: { ok: true } });
    const panel = window.document.getElementById("generate-panel");

    window.document.getElementById("mode-generate").click();
    assert.equal(panel.classList.contains("hidden"), false);

    window.document.getElementById("mode-upload").click();
    assert.equal(panel.classList.contains("hidden"), true);
  });

  it("puts the drop zone away while generating, and brings it back", () => {
    const window = mount({ reply: { ok: true } });
    const uploadPanel = window.document.getElementById("upload-panel");

    assert.equal(uploadPanel.classList.contains("hidden"), false);

    window.document.getElementById("mode-generate").click();
    assert.equal(uploadPanel.classList.contains("hidden"), true);

    window.document.getElementById("mode-upload").click();
    assert.equal(uploadPanel.classList.contains("hidden"), false);
  });

  it("stops asking for a file while generating", () => {
    const window = mount({ reply: { ok: true } });
    const file = window.document.getElementById("image");

    window.document.getElementById("mode-generate").click();
    assert.equal(file.hasAttribute("required"), false);

    window.document.getElementById("mode-upload").click();
    assert.equal(file.hasAttribute("required"), true);
  });

  it("does not start asking for a file on a form that never did", () => {
    const window = mount({ reply: { ok: true }, required: false });
    const file = window.document.getElementById("image");

    window.document.getElementById("mode-generate").click();
    window.document.getElementById("mode-upload").click();

    assert.equal(file.hasAttribute("required"), false);
  });

  it("puts the captured picture in the preview without leaving the page", async () => {
    const window = mount({
      reply: { ok: true, generatedFile: "abc.png", preview: "/media/tmp/abc.png" },
    });

    window.document.getElementById("mode-generate").click();
    window.document.getElementById("generate-button").click();
    await settle();

    assert.equal(window.document.getElementById("generated-file").value, "abc.png");
    assert.equal(
      window.document.getElementById("capture-preview").getAttribute("src"),
      "/media/tmp/abc.png"
    );
    assert.equal(
      window.document.getElementById("capture-preview").classList.contains("hidden"),
      false
    );
    assert.equal(window.document.getElementById("image").hasAttribute("required"), false);
  });

  it("asks the capture route for JSON and never sends the file field", async () => {
    const sent = [];
    const window = mount({
      reply: { ok: true, generatedFile: "abc.png", preview: "/media/tmp/abc.png" },
      sent,
    });

    window.document.getElementById("mode-generate").click();
    window.document.getElementById("generate-button").click();
    await settle();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "/admin/themes/screenshot");
    assert.equal(sent[0].options.method, "POST");
    assert.equal(sent[0].options.headers.Accept, "application/json");
    assert.equal(sent[0].options.body.get("mode"), "generate");
    assert.equal(sent[0].options.body.get("captureUrl"), "https://aurora.test");
    assert.equal(sent[0].options.body.get("image"), null);
  });

  it("shows what went wrong and keeps the page", async () => {
    const window = mount({ reply: { ok: false, error: "That address could not be reached." } });

    window.document.getElementById("mode-generate").click();
    window.document.getElementById("generate-button").click();
    await settle();

    assert.equal(window.document.getElementById("drop-error").classList.contains("hidden"), false);
    assert.equal(
      window.document.getElementById("drop-error-text").textContent,
      "That address could not be reached."
    );
    assert.equal(window.document.getElementById("generated-file").value, "");
  });

  it("drops the waiting capture when upload is chosen again", async () => {
    const window = mount({
      reply: { ok: true, generatedFile: "abc.png", preview: "/media/tmp/abc.png" },
    });

    window.document.getElementById("mode-generate").click();
    window.document.getElementById("generate-button").click();
    await settle();
    assert.equal(window.document.getElementById("generated-file").value, "abc.png");

    window.document.getElementById("mode-upload").click();

    assert.equal(window.document.getElementById("generated-file").value, "");
    assert.equal(
      window.document.getElementById("capture-preview").classList.contains("hidden"),
      true
    );
    assert.equal(window.document.getElementById("image").hasAttribute("required"), true);
  });

  it("does nothing on a form without the control", () => {
    const window = installDom("<body><form></form></body>");
    assert.doesNotThrow(() => startScreenshot({ root: window.document, win: window }));
  });
});

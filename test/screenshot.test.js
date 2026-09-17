/**
 * Tests for the capture engine
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCapture, lendErrorsNamespace, sourceOptions } from "../lib/screenshot.js";
import { FLATTEN_STICKY } from "../lib/flatten-sticky.js";
import { createUrlGuard } from "../lib/safe-url.js";

function replyWith(...steps) {
  const queue = [...steps];

  return async () => {
    const step = queue.shift();
    if (step instanceof Error) throw step;

    return {
      status: step.status ?? 200,
      headers: {
        get: (key) => (key.toLowerCase() === "location" ? (step.location ?? null) : null),
      },
    };
  };
}

const guard = createUrlGuard({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] });

const settings = { width: 1280, height: 1024, timeoutMs: 1000, guard };

describe("createCapture", () => {
  it("shoots the address when nothing redirects", async () => {
    const seen = [];
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 200 }),
      shoot: async (options) => seen.push(options),
    });

    await capture("https://example.test/", "/tmp/dest", "abc.png");

    assert.deepEqual(seen, [
      {
        url: "https://example.test/",
        destDir: "/tmp/dest",
        name: "abc.png",
        width: 1280,
        height: 1024,
        timeoutMs: 1000,
        fullPage: true,
      },
    ]);
  });

  it("follows a redirect and shoots where it lands", async () => {
    const seen = [];
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 302, location: "https://elsewhere.test/final" }, { status: 200 }),
      shoot: async (options) => seen.push(options),
    });

    await capture("https://example.test/", "/tmp/dest", "abc.png");

    assert.equal(seen[0].url, "https://elsewhere.test/final");
  });

  it("stops a redirect that points inside this network", async () => {
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 302, location: "http://169.254.169.254/latest/meta-data/" }),
      shoot: async () => assert.fail("the browser should never be asked"),
    });

    await assert.rejects(capture("https://example.test/", "/tmp/dest", "abc.png"), (error) => {
      assert.equal(error.code, "redirect-private");
      return true;
    });
  });

  it("stops a redirect into a scheme it cannot capture", async () => {
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 302, location: "file:///etc/passwd" }),
      shoot: async () => assert.fail("the browser should never be asked"),
    });

    await assert.rejects(capture("https://example.test/", "/tmp/dest", "abc.png"), (error) => {
      assert.equal(error.code, "redirect-private");
      return true;
    });
  });

  it("gives up after too many redirects", async () => {
    const capture = createCapture({
      ...settings,
      fetchImpl: async () => ({
        status: 302,
        headers: { get: () => "https://example.test/again" },
      }),
      shoot: async () => assert.fail("the browser should never be asked"),
    });

    await assert.rejects(capture("https://example.test/", "/tmp/dest", "abc.png"), (error) => {
      assert.equal(error.code, "unreachable");
      return true;
    });
  });

  it("reports a host it cannot reach", async () => {
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith(new Error("getaddrinfo ENOTFOUND")),
      shoot: async () => assert.fail("the browser should never be asked"),
    });

    await assert.rejects(capture("https://missing.test/", "/tmp/dest", "abc.png"), (error) => {
      assert.equal(error.code, "unreachable");
      return true;
    });
  });

  it("gives up on a capture that runs past the timeout", async () => {
    const capture = createCapture({
      ...settings,
      timeoutMs: 20,
      fetchImpl: replyWith({ status: 200 }),
      shoot: () => new Promise((resolve) => setTimeout(resolve, 200)),
    });

    await assert.rejects(capture("https://slow.test/", "/tmp/dest", "abc.png"), (error) => {
      assert.equal(error.code, "timeout");
      return true;
    });
  });

  it("hands the capture timeout to the browser", async () => {
    const seen = [];
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 200 }),
      shoot: async (options) => seen.push(options),
    });

    await capture("https://example.test/", "/tmp/dest", "abc.png");

    assert.equal(seen[0].timeoutMs, 1000);
  });

  it("asks for the whole page unless told otherwise", async () => {
    const seen = [];
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 200 }),
      shoot: async (options) => seen.push(options),
    });

    await capture("https://example.test/", "/tmp/dest", "abc.png");

    assert.equal(seen[0].fullPage, true);
  });

  it("crops to the viewport when the whole page is not wanted", async () => {
    const seen = [];
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 200 }),
      shoot: async (options) => seen.push(options),
    });

    await capture("https://example.test/", "/tmp/dest", "abc.png", { fullPage: false });

    assert.equal(seen[0].fullPage, false);
  });

  it("reports a browser that will not run", async () => {
    const capture = createCapture({
      ...settings,
      fetchImpl: replyWith({ status: 200 }),
      shoot: async () => {
        throw new Error("Could not find Chrome");
      },
    });

    await assert.rejects(capture("https://example.test/", "/tmp/dest", "abc.png"), (error) => {
      assert.equal(error.code, "engine");
      return true;
    });
  });
});

describe("lendErrorsNamespace", () => {
  it("puts the timeout error where capture-website looks for it", () => {
    class TimeoutError extends Error {}
    const puppeteer = { default: {}, TimeoutError };

    lendErrorsNamespace(puppeteer);

    assert.equal(puppeteer.default.errors.TimeoutError, TimeoutError);
  });

  it("leaves an errors namespace the browser already provides alone", () => {
    class TimeoutError extends Error {}
    const theirs = { TimeoutError: class Other extends Error {} };
    const puppeteer = { default: { errors: theirs }, TimeoutError };

    lendErrorsNamespace(puppeteer);

    assert.equal(puppeteer.default.errors, theirs);
  });
});

describe("sourceOptions", () => {
  it("pins floating bars down for a whole-page shot", () => {
    assert.deepEqual(sourceOptions(true), { crop: false, script: FLATTEN_STICKY });
  });

  it("leaves a cropped page as its visitors see it", () => {
    assert.deepEqual(sourceOptions(false), { crop: true, script: undefined });
  });
});

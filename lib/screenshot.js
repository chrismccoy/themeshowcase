/**
 * Taking a screenshot of a web page with a headless browser.
 */

import fs from "node:fs";
import path from "node:path";
import { createUrlGuard } from "./safe-url.js";

/**
 * How many redirects the walk will follow before giving up.
 */
const MAX_HOPS = 5;

/**
 * Builds an error the controller can tell apart.
 */
function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * The real browser. Loaded when it is first needed, so that a server with the
 * feature turned off never loads it.
 */
async function shootWithPageres({ url, destDir, name, width, height }) {
  const { default: Pageres } = await import("pageres");

  const base = name.replace(/\.png$/, "");

  await new Pageres({
    delay: 1,
    filename: base,
    launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  })
    .source(url, [`${width}x${height}`], { crop: true })
    .destination(destDir)
    .run();

  if (!fs.existsSync(path.join(destDir, `${base}.png`))) {
    throw new Error("the browser wrote no file");
  }
}

/**
 * Builds the capture function.
 */
export function createCapture({
  width,
  height,
  timeoutMs,
  fetchImpl = fetch,
  shoot = shootWithPageres,
  guard = createUrlGuard(),
}) {
  async function settle(start) {
    let current = start;

    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      let response;
      try {
        response = await fetchImpl(current, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw fail("unreachable", `could not reach ${current}`);
      }

      const location = response.headers.get("location");
      if (response.status < 300 || response.status > 399 || !location) return current;

      let next;
      try {
        next = new URL(location, current);
      } catch {
        throw fail("unreachable", `redirect to ${location} could not be read`);
      }

      const checked = await guard.check(next.href);
      if (!checked.ok) {
        throw fail(
          checked.reason === "unresolvable" ? "unreachable" : "redirect-private",
          `redirect to ${next.href} refused`
        );
      }

      current = next.href;
    }

    throw fail("unreachable", "too many redirects");
  }

  /**
   * Captures one page.
   */
  return async function capture(url, destDir, name) {
    const landing = await settle(url);

    let timer;
    const givesUp = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(fail("timeout", "the capture took too long")), timeoutMs);
    });

    try {
      await Promise.race([shoot({ url: landing, destDir, name, width, height }), givesUp]);
    } catch (error) {
      if (error.code === "timeout") throw error;
      throw fail("engine", error.message);
    } finally {
      clearTimeout(timer);
    }
  };
}

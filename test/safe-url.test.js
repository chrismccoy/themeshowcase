/**
 * Tests for the capture address guard.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createUrlGuard, isBlockedAddress } from "../lib/safe-url.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("isBlockedAddress", () => {
  const blocked = [
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.10",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
  ];

  const allowed = ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"];

  blocked.forEach((ip) => {
    it(`blocks ${ip}`, () => assert.equal(isBlockedAddress(ip), true));
  });

  allowed.forEach((ip) => {
    it(`allows ${ip}`, () => assert.equal(isBlockedAddress(ip), false));
  });

  it("treats an unreadable address as blocked", () => {
    assert.equal(isBlockedAddress("not an address"), true);
  });
});

describe("createUrlGuard", () => {
  it("accepts an ordinary public address", async () => {
    const guard = createUrlGuard({ lookup: publicLookup });
    const result = await guard.check("https://example.test/theme");
    assert.deepEqual(result, { ok: true, reason: null, url: "https://example.test/theme" });
  });

  it("refuses a scheme it cannot capture", async () => {
    const guard = createUrlGuard({ lookup: publicLookup });

    for (const value of ["file:///etc/passwd", "ftp://example.test", "javascript:alert(1)", "not a url"]) {
      const result = await guard.check(value);
      assert.equal(result.ok, false, `${value} should be refused`);
      assert.equal(result.reason, "scheme");
    }
  });

  it("refuses a host that resolves inside this network", async () => {
    const guard = createUrlGuard({ lookup: async () => [{ address: "127.0.0.1", family: 4 }] });
    const result = await guard.check("https://sneaky.test");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "private");
  });

  it("refuses when any resolved address is private", async () => {
    const guard = createUrlGuard({
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
    });

    const result = await guard.check("https://mixed.test");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "private");
  });

  it("refuses a literal private address without asking the resolver", async () => {
    const guard = createUrlGuard({
      lookup: async () => {
        throw new Error("the resolver should not be asked");
      },
    });

    const result = await guard.check("http://127.0.0.1:3000/admin");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "private");
  });

  it("accepts a literal public address", async () => {
    const guard = createUrlGuard({
      lookup: async () => {
        throw new Error("the resolver should not be asked");
      },
    });

    const result = await guard.check("https://93.184.216.34/page");
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://93.184.216.34/page");
  });

  it("reads an address in brackets", async () => {
    const guard = createUrlGuard({
      lookup: async () => {
        throw new Error("the resolver should not be asked");
      },
    });

    const result = await guard.check("http://[::1]:3000/");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "private");
  });

  it("refuses a host that does not resolve", async () => {
    const guard = createUrlGuard({
      lookup: async () => {
        throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
      },
    });

    const result = await guard.check("https://missing.test");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unresolvable");
  });

  it("refuses a host that resolves to nothing at all", async () => {
    const guard = createUrlGuard({ lookup: async () => [] });
    const result = await guard.check("https://empty.test");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unresolvable");
  });
});

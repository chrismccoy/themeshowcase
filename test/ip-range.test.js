/**
 * Tests for reading addresses and ranges
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEntry, toBytes, inRange } from "../lib/ip-range.js";

const covers = (entry, ip) => inRange(parseEntry(entry), toBytes(ip));

describe("reading an address", () => {
  it("reads the four parts of an IPv4 address", () => {
    assert.deepEqual([...toBytes("203.0.113.4")], [203, 0, 113, 4]);
  });

  it("reads an IPv6 address, filling in what the double colon stands for", () => {
    assert.deepEqual([...toBytes("::1")], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual(
      [...toBytes("2001:db8::8a2e:370:7334")].slice(0, 4),
      [0x20, 0x01, 0x0d, 0xb8]
    );
  });

  it("reads the shortest IPv6 address there is", () => {
    assert.deepEqual([...toBytes("::")], new Array(16).fill(0));
  });

  it("reads an IPv4 address written inside an IPv6 one", () => {
    assert.deepEqual([...toBytes("2001:db8::203.0.113.4")].slice(12), [203, 0, 113, 4]);
  });

  it("refuses what is not an address", () => {
    for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.0.0.1", "1.2.3.04", "nonsense", "::1::2", "12345::1", "2001:db8:::1"]) {
      assert.equal(toBytes(bad), null, bad);
    }
  });
});

describe("reading an entry", () => {
  it("treats a bare address as itself alone", () => {
    const entry = parseEntry("203.0.113.4");
    assert.equal(entry.bits, 32);
    assert.deepEqual([...entry.bytes], [203, 0, 113, 4]);
  });

  it("treats a bare IPv6 address as itself alone", () => {
    assert.equal(parseEntry("::1").bits, 128);
  });

  it("reads a prefix length", () => {
    assert.equal(parseEntry("192.168.1.0/24").bits, 24);
    assert.equal(parseEntry("2001:db8::/32").bits, 32);
  });

  it("clears the parts of the address the prefix does not cover", () => {
    assert.deepEqual([...parseEntry("192.168.1.77/24").bytes], [192, 168, 1, 0]);
  });

  it("refuses a prefix longer than the address", () => {
    assert.throws(() => parseEntry("192.168.1.0/33"), /prefix/i);
    assert.throws(() => parseEntry("::1/129"), /prefix/i);
  });

  it("refuses a prefix that is not a number", () => {
    assert.throws(() => parseEntry("192.168.1.0/-1"), /prefix/i);
    assert.throws(() => parseEntry("192.168.1.0/x"), /prefix/i);
    assert.throws(() => parseEntry("192.168.1.0/"), /prefix/i);
  });

  it("refuses an entry that is not an address at all", () => {
    assert.throws(() => parseEntry("nonsense"), /address/i);
    assert.throws(() => parseEntry("1.2.3/24"), /address/i);
  });
});

describe("deciding what falls inside a range", () => {
  it("covers every address in an IPv4 range", () => {
    assert.equal(covers("192.168.1.0/24", "192.168.1.1"), true);
    assert.equal(covers("192.168.1.0/24", "192.168.1.255"), true);
    assert.equal(covers("192.168.1.0/24", "192.168.2.1"), false);
  });

  it("handles a range that does not fall on a byte boundary", () => {
    assert.equal(covers("10.0.0.0/12", "10.15.255.255"), true);
    assert.equal(covers("10.0.0.0/12", "10.16.0.0"), false);
  });

  it("treats a full length prefix as one address", () => {
    assert.equal(covers("203.0.113.4/32", "203.0.113.4"), true);
    assert.equal(covers("203.0.113.4/32", "203.0.113.5"), false);
  });

  it("lets a zero length prefix cover everything of its kind", () => {
    assert.equal(covers("0.0.0.0/0", "203.0.113.4"), true);
    assert.equal(covers("0.0.0.0/0", "::1"), false);
  });

  it("covers an IPv6 range", () => {
    assert.equal(covers("2001:db8::/32", "2001:db8:1234::1"), true);
    assert.equal(covers("2001:db8::/32", "2001:db9::1"), false);
    assert.equal(covers("::1/128", "::1"), true);
    assert.equal(covers("::1/128", "::2"), false);
  });

  it("never lets one kind of address match the other", () => {
    assert.equal(covers("192.168.1.0/24", "::ffff:192.168.1.1"), false);
    assert.equal(covers("::/0", "192.168.1.1"), false);
  });

  it("says no to an address it could not read", () => {
    assert.equal(inRange(parseEntry("192.168.1.0/24"), toBytes("nonsense")), false);
  });
});

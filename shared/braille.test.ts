import assert from "node:assert/strict";
import { test } from "node:test";
import { BLANK, cellToUnicode, getUnsupportedCharacters, layoutBraille, toUnicodeBraille } from "./braille";

test("empty input and explicit empty lines", () => {
  assert.deepEqual(layoutBraille(""), []);
  assert.deepEqual(layoutBraille("\n"), [[], []]);
  assert.deepEqual(layoutBraille("a\n\nb").map((line) => line.length), [1, 0, 1]);
});

test("pasted line endings and horizontal whitespace normalize consistently", () => {
  assert.deepEqual(layoutBraille("a\r\nb\rc"), layoutBraille("a\nb\nc"));
  assert.deepEqual(layoutBraille("a\tb\u00a0c"), layoutBraille("a b c"));
  assert.deepEqual(getUnsupportedCharacters("a\r\n\t\u00a0b"), []);
});

test("number and letter indicators count toward printer capacity", () => {
  assert.deepEqual(layoutBraille("12a"), [["001111", "100000", "110000", "000011", "100000"]]);
  assert.equal(layoutBraille("12345678901234").length, 2);
});

test("wraps whole words and splits long words without overflowing", () => {
  assert.deepEqual(layoutBraille("abc de", 5).map((line) => line.length), [3, 2]);
  const lines = layoutBraille("abcdefghijklmnop", 5);
  assert.deepEqual(lines.map((line) => line.length), [5, 5, 5, 4]);
  assert.equal(lines[0].at(-1), "001001");
  for (const width of [2, 5, 14]) {
    for (const text of ["a".repeat(150), "1234567890".repeat(12), "one two  three\n\nfour"]) {
      assert.ok(layoutBraille(text, width).every((line) => line.length <= width));
    }
  }
});

test("rejects widths that could cause non-terminating layout", () => {
  for (const width of [0, 1, -1, 2.5, NaN, Infinity]) {
    assert.throws(() => layoutBraille("abc", width), RangeError);
  }
});

test("reports unsupported Unicode characters once, without flagging uppercase ASCII", () => {
  assert.deepEqual(getUnsupportedCharacters("Hello café 🙂é🙂"), ["é", "🙂"]);
  assert.deepEqual(getUnsupportedCharacters("HELLO 123!?"), []);
});

test("Unicode download preserves exactly one character per cell and line breaks", () => {
  assert.equal(cellToUnicode("100000"), "⠁");
  assert.equal(cellToUnicode("111111"), "⠿");
  assert.equal(toUnicodeBraille([["100000", BLANK], [], ["110000"]]), "⠁⠀\n\n⠃");
});

test("typographic punctuation prints as its plain equivalent", () => {
  const text = "It\u2019s \u201Cfine\u201D \u2014 really\u2026";
  assert.deepEqual(getUnsupportedCharacters(text), []);
  assert.deepEqual(layoutBraille(text), layoutBraille(`It's "fine" - really...`));
  assert.deepEqual(getUnsupportedCharacters("50\u00B0C"), ["\u00B0"]);
});

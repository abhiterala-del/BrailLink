// Basic six-dot conversion shared by the web preview and the print server,
// so what the user sees is exactly what gets embossed.
//
// A cell is a 6-character string of raised dots in order 1-6, e.g. "100000" = dot 1 = "a".

export const CHARS_PER_LINE = 14;
export const MAX_LINES = 10;

export const BLANK = "000000";
const HYPHEN = "001001";
const NUMBER_SIGN = "001111";
const LETTER_SIGN = "000011";

const dots: Record<string, string> = {
  " ": BLANK,
  "!": "011010",
  '"': "011001",
  "#": "001111",
  "$": "110101",
  "%": "100101",
  "&": "111101",
  "'": "001000",
  "(": "111011",
  ")": "011111",
  "*": "100001",
  "+": "000010",
  ",": "010000",
  "-": HYPHEN,
  ".": "010011",
  "/": "001100",
  "0": "010110",
  "1": "100000",
  "2": "110000",
  "3": "100100",
  "4": "100110",
  "5": "100010",
  "6": "110100",
  "7": "110110",
  "8": "110010",
  "9": "010100",
  ":": "010010",
  ";": "011000",
  "=": "111111",
  "?": "011001",
  "@": "000100",
  a: "100000",
  b: "110000",
  c: "100100",
  d: "100110",
  e: "100010",
  f: "110100",
  g: "110110",
  h: "110010",
  i: "010100",
  j: "010110",
  k: "101000",
  l: "111000",
  m: "101100",
  n: "101110",
  o: "101010",
  p: "111100",
  q: "111110",
  r: "111010",
  s: "011100",
  t: "011110",
  u: "101001",
  v: "111001",
  w: "010111",
  x: "101101",
  y: "101111",
  z: "101011",
};

// OCR and transcription often return typographic punctuation; map it to the
// plain characters the printer supports.
const punctuationReplacements: [RegExp, string][] = [
  [/[\u2018\u2019\u201A\u2032]/g, "'"], // curly single quotes, prime
  [/[\u201C\u201D\u201E\u2033]/g, '"'], // curly double quotes, double prime
  [/[\u2010-\u2015\u2212]/g, "-"], // hyphens, en/em dashes, minus sign
  [/\u2026/g, "..."], // ellipsis
];

// Treat pasted line endings, whitespace and punctuation consistently on both servers.
function normalizeText(text: string): string {
  let normalized = text.replace(/\r\n?/g, "\n").replace(/[^\S\n]/g, " ");
  for (const [pattern, replacement] of punctuationReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

export function getUnsupportedCharacters(text: string): string[] {
  return [...new Set([...normalizeText(text)].filter(
    (character) => character !== "\n" && !Object.hasOwn(dots, character.toLowerCase()),
  ))];
}

function wordToCells(word: string): string[] {
  const cells: string[] = [];
  let inNumber = false;
  for (const raw of word) {
    const ch = raw.toLowerCase();
    const isDigit = ch >= "0" && ch <= "9";
    if (isDigit && !inNumber) {
      cells.push(NUMBER_SIGN);
    } else if (inNumber && ch >= "a" && ch <= "j") {
      // a-j share cells with 1-0, so mark the switch back to letters
      cells.push(LETTER_SIGN);
    }
    cells.push(dots[ch] ?? BLANK);
    inNumber = isDigit;
  }
  return cells;
}

// Word-wraps text into lines of at most `width` cells, hyphenating words that
// are longer than a full line.
export function layoutBraille(text: string, width = CHARS_PER_LINE): string[][] {
  if (!Number.isInteger(width) || width < 2) {
    throw new RangeError("Braille line width must be an integer of at least 2");
  }
  if (!text) return [];
  const lines: string[][] = [];

  for (const rawLine of normalizeText(text).split("\n")) {
    let line: string[] = [];
    for (const word of rawLine.split(" ")) {
      let cells = wordToCells(word);
      if (line.length > 0) {
        if (line.length + 1 + cells.length > width) {
          lines.push(line);
          line = [];
        } else {
          line.push(BLANK);
        }
      }
      while (cells.length > width) {
        lines.push([...cells.slice(0, width - 1), HYPHEN]);
        cells = cells.slice(width - 1);
      }
      line.push(...cells);
    }
    lines.push(line);
  }

  return lines;
}

// No display-only spacing: one Unicode character represents one physical cell.
export function toUnicodeBraille(lines: string[][]): string {
  return lines.map((line) => line.map(cellToUnicode).join("")).join("\n");
}

export function cellToUnicode(cell: string): string {
  let code = 0x2800;
  for (let i = 0; i < 6; i++) {
    if (cell[i] === "1") code += 1 << i;
  }
  return String.fromCharCode(code);
}

// 打鍵数比較スクリプト（tools/keystrokes.js）のテスト。コーパスのダウンロードはしない
import { describe, expect, test } from "bun:test";
import { parseTable, parseText } from "../docs/romaji.js";
import { countStrokes, DEFAULT_SERIES, diffSentences, joinReadings, loadSeries, measure, parseKnp, parseSeries } from "../tools/keystrokes.js";
import { readText } from "./helpers.js";

const root = new URL("../", import.meta.url).pathname;
const series = await Promise.all(DEFAULT_SERIES.map(loadSeries));
const byName = Object.fromEntries(series.map((s) => [s.name, s]));
const texts = JSON.parse(await readText(root + "docs/playground-texts.json"));
// 問題文（{表示|読み}）→ { kana: 読み, typed: 表示（変換後の日本語）}
const items = texts.map((x) => {
  const parts = parseText(x.text);
  return { kana: parts.map((p) => p.kana).join(""), typed: parts.map((p) => p.display).join("") };
});

describe("系列の指定", () => {
  test("名前=パス は拡張あり、:noext を付けると拡張なし", () => {
    expect(parseSeries("A=x.txt")).toEqual({ name: "A", path: "x.txt", ext: true });
    expect(parseSeries("A b=x.txt:noext")).toEqual({ name: "A b", path: "x.txt", ext: false });
  });
  test("= がなければエラー", () => {
    expect(() => parseSeries("x.txt")).toThrow();
  });
});

describe("打鍵数", () => {
  test.each([
    ["QWERTY", "かんじ", 5],
    ["QWERTY", "がっこう", 6],
    ["DvorakJP", "こんにちは", 8],
    ["DvorakJP lite", "とうきょう", 5],
    ["DvorakJP lite", "んのうぇ", 5],
    ["AZIK", "かんじ", 4],
    ["AZIK", "ゔぁいおりん", 5], // vq o rk。変換表の出力はカタカナの「ヴ」
  ])("%s で %s は %i 打", (name, kana, n) => {
    const s = byName[name];
    expect(countStrokes(s.table, kana, s.ext)).toBe(n);
  });

  test("打てないかなは null", () => {
    expect(countStrokes(byName.QWERTY.table, "々", true)).toBeNull();
  });
});

describe("練習ページの問題文で計測する", () => {
  const r = measure(series, items, ["DvorakJP", "DvorakJP lite"]);
  const strokes = Object.fromEntries(r.series.map((s) => [s.name, s.strokes]));

  test("すべての文を計測し、比は最初の系列（QWERTY）が基準", () => {
    expect(r.used).toBe(items.length);
    expect(r.series[0].ratio).toBe(1);
  });

  test("打鍵効率は 変換後の日本語の文字数 ÷ 打鍵数", () => {
    expect(r.chars).toBe(items.reduce((n, x) => n + [...x.typed].length, 0));
    for (const s of r.series) expect(s.efficiency).toBeCloseTo(r.chars / s.strokes, 4);
  });

  test("2つの系列で打鍵数が違う文を数える", () => {
    expect(r.diff).toMatchObject({ a: "DvorakJP", b: "DvorakJP lite" });
    expect(r.diff.fewerStrokes - r.diff.moreStrokes).toBe(strokes.DvorakJP - strokes["DvorakJP lite"]);
  });

  test("lite ≤ QWERTY、短縮拡張 ≤ lite", () => {
    expect(strokes["DvorakJP lite"]).toBeLessThanOrEqual(strokes.QWERTY);
    expect(strokes["DvorakJP lite ＋ 短縮拡張"]).toBeLessThanOrEqual(strokes["DvorakJP lite"]);
  });
});

describe("2つの系列で打鍵数が違う文", () => {
  test("打鍵数の差と、それぞれの打ち方を返す（同じ文は含めない）", () => {
    const items = ["んのうぇ", "あい"].map((kana) => ({ text: kana, kana }));
    const d = diffSentences(byName.QWERTY, byName["DvorakJP lite"], items);
    expect(d).toEqual([
      { d: -1, text: "んのうぇ", kana: "んのうぇ", QWERTY: "nn no we", "DvorakJP lite": "n v, le" },
    ]);
  });
});

describe("読みの取り出し", () => {
  test("語の読みをつなげ、カタカナはひらがなにする。？ などの記号は数えない", () => {
    expect(joinReadings([
      { surface: "本当", reading: "ホントウ", symbol: false },
      { surface: "？", reading: "？", symbol: true },
    ])).toEqual({ kana: "ほんとう", typed: "本当" });
  });

  test("読みのない語（英字など）があれば null", () => {
    expect(joinReadings([{ surface: "Mac", reading: null, symbol: false }])).toBeNull();
  });

  test("KNP 形式から文と読みを取り出す（句読点は残す）", () => {
    const knp = [
      "# S-ID:x-1",
      "* 1D",
      "+ 1D",
      "太郎 たろう 太郎 名詞 6 人名 5 * 0 * 0",
      "は は は 助詞 9 副助詞 2 * 0 * 0",
      "、 、 、 特殊 1 読点 2 * 0 * 0",
      "「 「 「 特殊 1 括弧始 3 * 0 * 0",
      "＊ ＊ ＊ 特殊 1 記号 5 * 0 * 0",
      "EOS",
    ].join("\n");
    expect(parseKnp(knp)).toEqual([{ text: "太郎は、「＊", kana: "たろうは、「", typed: "太郎は、「" }]);
  });
});

test("トップページの打鍵効率のグラフが docs/data/keystrokes.json と一致する（違えば bun tools/keystroke-chart.js で作り直す）", async () => {
  const { currentSection, renderSection } = await import("../tools/keystroke-chart.js");
  const result = JSON.parse(await readText(root + "docs/data/keystrokes.json"));
  expect(currentSection(await readText(root + "docs/index.html"))).toBe(renderSection(result));
});

test("README の打鍵効率の表が docs/data/keystrokes.json と一致する（違えば bun tools/keystroke-chart.js で作り直す）", async () => {
  const { currentSection, renderReadme } = await import("../tools/keystroke-chart.js");
  const result = JSON.parse(await readText(root + "docs/data/keystrokes.json"));
  expect(currentSection(await readText(root + "README.md"))).toBe(renderReadme(result));
});

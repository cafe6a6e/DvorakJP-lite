// QWERTY 配列用の変換表（docs/romantable_dvorakjplite_qwerty_us.txt / _jis.txt）の検査
import { describe, expect, test } from "bun:test";
import { deletePending, flush, judge, parseTable, parseText, plan, romajiLayout } from "../docs/romaji.js";
import { convertKeys, convertTable, invert } from "../docs/keymap.js";
import { QWERTY_LAYOUTS, SOURCE_PATH, pathOf } from "../tools/dvorak-to-qwerty.js";
import { findDuplicateKeys, readText } from "./helpers.js";

const sourceText = await readText(SOURCE_PATH);
const dvorak = parseTable(sourceText);
const texts = JSON.parse(await readText(new URL("../docs/playground-texts.json", import.meta.url).pathname));

// 練習ページと同じく、キー列を1文字ずつ判定に通す。最後まで打ち切れたら true
function typeAll(t, keys, target) {
  let typed = "";
  for (const c of keys) {
    const r = judge(t, typed, c, target);
    if (!r.ok) return false;
    typed += c;
    if (r.done) return typed === keys;
  }
  return false;
}

// 変換スクリプトとは別に、キー位置を目で確かめられる形で書いておく
const KEY_ROWS = {
  "qwerty-us": [
    ["',.pyfgcrl/=", "qwertyuiop[]"], // 上段
    ["aoeuidhtns-", "asdfghjkl;'"], // ホーム段
    [";qjkxbmwvz", "zxcvbnm,./"], // 下段
    ["[]", "-="], // 数字段の右
  ],
  "qwerty-jis": [
    ["',.pyfgcrl/=", "qwertyuiop@["], // 上段（P の右は @ と [）
    ["aoeuidhtns-", "asdfghjkl;:"], // ホーム段（L の右は ; と :）
    [";qjkxbmwvz", "zxcvbnm,./"], // 下段
    ["[]", "-^"], // 数字段の右（0 の右は - と ^）
  ],
};

// QWERTY 配列で実際に押すキーを、手で書いた例（配列で変わらないもの）
const COMMON_CASES = [
  ["vslllgkgja", "こんにちは"], // konnnitiha
  ["vtsfja", "きょうは"], // kyouha
  ["vtwja", "きょうは"], // ky,ha
  ["iw", "こう"], // c,
  ["iq", "かい"], // c'
  ["ix", "こん"], // cq
  ["ib", "きん"], // cx
  [".c", "ねん"], // vj
  [".w", "のう"], // v,
  [";e", "せい"], // s.
  ["/e", "ぜい"], // z.
  ["rjq", "ぴゃい"], // ph'
  ["rjw", "ぴょう"], // ph,
  ["vvw", "っこう"], // kk,
  ["e", "。"], // .
  ["w", "、"], // ,
  ["zw", "‥"], // ;,
  ["~", "〜"], // ~
];

// 記号の位置が US と JIS で違うもの
const LAYOUT_CASES = {
  "qwerty-us": [
    ["i'", "かい"], // c-
    ["'", "ー"], // -
    ["-", "「"], // [
    ["=", "」"], // ]
    ["z'", "〜"], // ;-
    ["z[", "・"], // ;/
  ],
  "qwerty-jis": [
    ["i:", "かい"], // c-
    [":", "ー"], // -
    ["-", "「"], // [
    ["^", "」"], // ]
    ["z:", "〜"], // ;-
    ["z@", "・"], // ;/
  ],
};

describe.each(QWERTY_LAYOUTS)("%s", (id, layout) => {
  const text = Bun.file(pathOf(layout));
  const toDvorak = invert(layout.map);

  describe("キーの対応表", () => {
    test("1対1に対応している", () => {
      expect(toDvorak.size).toBe(layout.map.size);
    });

    test.each(KEY_ROWS[id])("Dvorak %p は QWERTY %p の位置", (d, q) => {
      expect(convertKeys(d, layout.map)).toBe(q);
      expect(convertKeys(q, toDvorak)).toBe(d);
    });
  });

  describe("生成したファイル", async () => {
    const qwertyText = await text.text();

    test("変換スクリプトの出力と一致する（bun run build:qwerty で作り直す）", () => {
      expect(qwertyText).toBe(convertTable(sourceText, layout.map));
    });

    test("行数・出力（2列目）が元の表と同じで、入力を Dvorak に戻すと元の表になる", () => {
      const src = sourceText.split("\n");
      const out = qwertyText.split("\n");
      expect(out.length).toBe(src.length);
      for (const [i, line] of out.entries()) {
        const [key, kana, pend] = line.split("\t");
        const [srcKey, srcKana, srcPend] = src[i].split("\t");
        expect(convertKeys(key, toDvorak)).toBe(srcKey);
        expect(kana).toBe(srcKana);
        expect(pend === undefined ? undefined : convertKeys(pend, toDvorak)).toBe(srcPend);
      }
    });

    test("重複したキーがない", () => {
      expect(findDuplicateKeys(qwertyText)).toEqual([]);
    });
  });

  describe("Dvorak 版と同じ位置のキーで、同じかなになる", async () => {
    const qwerty = parseTable(await text.text());

    test("変換表のキー2つまでの組み合わせすべて", () => {
      const keys = [...dvorak.table.keys()];
      const diffs = [];
      let checked = 0;
      for (const a of ["", ...keys]) {
        for (const b of keys) {
          const s = a + b;
          const expected = flush(dvorak, s);
          // 未変換の英字が残る列は、残る文字自体が配列で変わるので対象外
          if (/[ -~]/.test(expected)) continue;
          checked++;
          const q = convertKeys(s, layout.map);
          const actual = flush(qwerty, q);
          if (actual !== expected) diffs.push(`${s}（QWERTY ${q}）: Dvorak=${expected} QWERTY=${actual}`);
        }
      }
      expect(checked).toBeGreaterThan(100000);
      expect(diffs.slice(0, 40)).toEqual([]);
    });

    test.each([...COMMON_CASES, ...LAYOUT_CASES[id]])("%p → %p", (keys, kana) => {
      expect(flush(qwerty, keys)).toBe(kana);
    });
  });

  // 練習ページ: 下段（Dvorak 用の表で作る）の打ち方を、QWERTY の同じ位置のキーで打つ
  describe("練習の問題文を、表示どおりの打ち方で最後まで打てる", async () => {
    const qwerty = parseTable(await text.text());

    test.each(texts.map((x) => [x.genre, x]))("「%s」", (_genre, x) => {
      const kana = parseText(x.text).map((i) => i.kana).join("");
      const std = romajiLayout(dvorak, kana).map((seg) => seg.key).join("");
      const ext = plan(dvorak, kana, true).map((seg) => seg.key).join("");
      expect(typeAll(qwerty, convertKeys(std, layout.map), kana)).toBe(true);
      expect(typeAll(qwerty, convertKeys(ext, layout.map), kana)).toBe(true);
    });

    test("Backspace で入力中のキーを消せる", () => {
      // ky（QWERTY では vt）まで打った状態から、y を消す
      const typed = convertKeys("ky", layout.map);
      expect(deletePending(qwerty, typed)).toEqual({ typed: typed[0], pending: typed[0] });
    });
  });
});

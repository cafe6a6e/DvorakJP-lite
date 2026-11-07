// QWERTY 配列用の変換表（docs/romantable_dvorakjplite_qwerty_us.txt / _jis.txt）の検査
import { describe, expect, test } from "bun:test";
import { deletePending, flush, judge, parseTable, parseText, plan, romajiLayout } from "../docs/romaji.js";
import { buildQwertyTable, convertKeys, invert, simplifyForQwerty } from "../docs/keymap.js";
import { QWERTY_LAYOUTS, SOURCE_PATH, pathOf } from "../tools/dvorak-to-qwerty.js";
import { findDuplicateKeys, readText } from "./helpers.js";

const sourceText = await readText(SOURCE_PATH);
// QWERTY 用の表は、簡単にした Dvorak 用の表から作る
const simplifiedText = simplifyForQwerty(sourceText);
const dvorak = parseTable(simplifiedText);
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
  ["kq", "たい"], // t'（てぃ などを消したので、次のキーを待たずに確定する）
  ["kqa", "たいあ"], // t'a
  ["q", "ー"], // '
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
    ["'", "ー"], // -
    ["-", "「"], // [
    ["=", "」"], // ]
    ["z'", "〜"], // ;-
    ["z[", "・"], // ;/
  ],
  "qwerty-jis": [
    [":", "ー"], // -
    ["-", "「"], // [
    ["^", "」"], // ]
    ["z:", "〜"], // ;-
    ["z@", "・"], // ;/
  ],
};

// 右下の / の代わりに - でも打てるもの（配列で変わらない）
const EXTRA_CASES = [
  ["-a", "ざ"], // za
  ["-q", "ざい"], // z'
  ["-e", "ぜい"], // z.
  ["-ta", "じゃ"], // zya
  ["--a", "っざ"], // zza（-- は っ）
  ["/a", "ざ"], // za（/ でも今までどおり打てる）
  ["z.", "…"], // 普通のローマ字と同じ記号
  ["z,", "‥"],
  ["z/", "・"],
];

describe("Dvorak 用の表を QWERTY 用に簡単にする", () => {
  const before = parseTable(sourceText).table;
  const after = dvorak.table;
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const added = [...after.keys()].filter((k) => !before.has(k));

  test("消えるのは X- の「ア段＋い」、z の記号、' の後にキーが続く行だけ", () => {
    const dash = removed.filter((k) => k.endsWith("-"));
    const zSymbols = removed.filter((k) => k.startsWith("z") && !k.endsWith("-"));
    const inner = removed.filter((k) => k.slice(0, -1).includes("'"));
    expect(dash.length).toBe(34);
    expect(zSymbols.sort()).toEqual(["z/", "z[", "z]", "zh", "zl"]);
    expect(inner.sort()).toEqual(["d'i", "d'u", "d'y", "d'yu", "t'i", "t'u", "t'y", "t'yu"]);
    expect(removed.length).toBe(dash.length + zSymbols.length + inner.length);
    for (const k of dash) expect(after.get(k.slice(0, -1) + "'")).toEqual(before.get(k));
  });

  test("' 単独の「ー」だけが増える", () => {
    expect(added).toEqual(["'"]);
    expect(after.get("'").out).toBe("ー");
  });

  test("残った行は元の表と同じ", () => {
    for (const [k, e] of after) if (k !== "'") expect(e).toEqual(before.get(k));
  });
});

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
      expect(qwertyText).toBe(buildQwertyTable(sourceText, layout));
    });

    // 足した - の行と記号の行を除くと、簡単にした Dvorak 用の表と1行ずつ対応する
    const slash = layout.map.get("z");
    const lines = qwertyText.split("\n");
    const isExtra = (line, prev) =>
      prev !== undefined && prev.split("\t")[0].includes(slash) && line === prev.replaceAll(slash, "-");
    const symbolLines = [...layout.symbols].map(([key, kana]) => `${key}\t${kana}`);
    const extraLines = lines.filter((line, i) => isExtra(line, lines[i - 1]));
    const base = lines.filter((line, i) => !isExtra(line, lines[i - 1]) && !symbolLines.includes(line));

    test("- の行と記号の行を除くと、行数・出力（2列目）が簡単にした表と同じで、入力を Dvorak に戻すと簡単にした表になる", () => {
      const src = simplifiedText.split("\n");
      expect(base.length).toBe(src.length);
      for (const [i, line] of base.entries()) {
        const [key, kana, pend] = line.split("\t");
        const [srcKey, srcKana, srcPend] = src[i].split("\t");
        expect(convertKeys(key, toDvorak)).toBe(srcKey);
        expect(kana).toBe(srcKana);
        expect(pend === undefined ? undefined : convertKeys(pend, toDvorak)).toBe(srcPend);
      }
    });

    test("- の行は、Dvorak の z を含む行ごとに1行ずつある", () => {
      const zRows = simplifiedText.split("\n").filter((l) => l.split("\t")[0].includes("z")).length;
      expect(zRows).toBeGreaterThan(30);
      expect(extraLines.length).toBe(zRows);
    });

    test("z. … などの記号の行は、同じ記号を ; の位置のキーで打つ行のすぐ後にある", () => {
      const semicolon = layout.map.get(";");
      for (const line of symbolLines) {
        const i = lines.indexOf(line);
        expect(i).toBeGreaterThan(0);
        const [prevKey, prevKana] = lines[i - 1].split("\t");
        expect(prevKey.startsWith(semicolon)).toBe(true);
        expect(prevKana).toBe(line.split("\t")[1]);
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
      let bracketDiffs = 0;
      for (const a of ["", ...keys]) {
        for (const b of keys) {
          const s = a + b;
          const expected = flush(dvorak, s);
          // 未変換の英字が残る列は、残る文字自体が配列で変わるので対象外
          if (/[ -~]/.test(expected)) continue;
          checked++;
          const q = convertKeys(s, layout.map);
          const actual = flush(qwerty, q);
          if (actual === expected) continue;
          // - は Dvorak の [（「）と z の両方なので、[ の後に z の続きが来ると z として読まれる（「あ ではなく ざ など）
          if (s.includes("[")) {
            bracketDiffs++;
            continue;
          }
          diffs.push(`${s}（QWERTY ${q}）: Dvorak=${expected} QWERTY=${actual}`);
        }
      }
      expect(checked).toBeGreaterThan(100000);
      expect(bracketDiffs).toBeGreaterThan(0);
      expect(diffs.slice(0, 40)).toEqual([]);
    });

    test.each([...COMMON_CASES, ...LAYOUT_CASES[id], ...EXTRA_CASES])("%p → %p", (keys, kana) => {
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

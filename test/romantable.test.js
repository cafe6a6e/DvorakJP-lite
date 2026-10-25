// 変換表（docs/romantable_dvorakjplite.txt）の検査
import { describe, expect, test } from "bun:test";
import { flush, parseTable } from "../docs/romaji.js";
import { BASE_PATH, TABLE_PATH, findDuplicateKeys, readText } from "./helpers.js";

const tableText = await readText(TABLE_PATH);
const table = parseTable(tableText);

// 基準から、意図して削除した QWERTY 記号入力を除く（DvorakJP の ぜい/ぞう/ぜん/ずん/ざい と衝突するため）
const REMOVED_KEYS = ["z.", "z,", "zj", "zk", "z-"];
const baseText = (await readText(BASE_PATH))
  .split("\n")
  .filter((line) => !REMOVED_KEYS.includes(line.split("\t")[0]))
  .join("\n");
const base = parseTable(baseText);

// QWERTY で打つ単語（基準と同じ結果になるべきもの）
const QWERTY_WORDS = [
  "un.", "un,", "enpou", "enjo", "enko", "konbanha", "kan'i", "kinnyoubi", "sanpo",
  "denwa", "shinpai", "genki", "kanji", "ninki", "honjitsu", "unxtu", "kinyoubi",
  "sankyuu", "kankwa", "sanpyou", "onjyou", "unxa", "un;-", "un;.", "un;,",
  "konnnichiha", "ten'in", "tanpaku", "nyuuin", "tyotto", "tt", "xtu", "ltu",
];

// DvorakJP の拡張入力の期待値
const DVORAK_CASES = [
  ["c'", "かい"], ["c-", "かい"], ["k;", "かん"], ["c.", "けい"], ["c,", "こう"],
  ["cp", "くう"], ["ck", "くん"], ["cj", "けん"], ["cq", "こん"], ["cx", "きん"],
  ["z.", "ぜい"], ["z,", "ぞう"], ["zj", "ぜん"], ["zk", "ずん"], ["z-", "ざい"],
  ["t'", "たい"], ["t-", "たい"], ["t'i", "てぃ"], ["t'y,", "たいよう"],
  ["s.", "せい"], ["sx", "しん"], ["hp", "ふう"], ["hk", "ふん"], ["fk", "ふん"],
  ["y,", "よう"], ["yp", "ゆう"], ["w'", "わい"],
  ["cyp", "きゅう"], ["ky,", "きょう"], ["ky-", "きゃい"], ["sh,", "しょう"],
  ["j,", "じょう"], ["jp", "じゅう"], ["ch,", "ちょう"], ["ry,", "りょう"],
  ["pha", "ぴゃ"], ["ph,", "ぴょう"], ["php", "ぴゅう"], ["ph-", "ぴゃい"],
  // な行の拡張は n ではなく v（Dvorak で n の真下）で打つ
  ["v'", "ない"], ["v-", "ない"], ["v;", "なん"], ["v.", "ねい"], ["v,", "のう"],
  ["vp", "ぬう"], ["vk", "ぬん"], ["vj", "ねん"], ["vq", "のん"], ["vx", "にん"],
  ["vjp,", "ねんぽう"], ["vji", "ねんい"], ["vxt.", "にんてい"], ["v;da", "なんだ"],
  ["va", "ゔぁ"], ["vu", "ゔ"], ["vyu", "ゔゅ"], ["vva", "っゔぁ"],
  // 促音: 「っ」の後に同じ子音が残る
  ["bba", "っば"], ["kk,", "っこう"], ["cc'", "っかい"], ["tchi", "っち"],
  ["nyp", "にゅう"], ["ny,", "にょう"],
];

// 完成エントリの後ろにできる、未完成の接頭辞（Mozc の行き詰まり処理に頼る箇所）
function danglingPrefixes(t) {
  const res = new Set();
  for (const longer of t.table.keys()) {
    for (let i = 1; i < longer.length; i++) {
      if (!t.table.has(longer.slice(0, i))) continue;
      for (let j = i + 1; j < longer.length; j++) {
        const mid = longer.slice(0, j);
        if (!t.table.has(mid)) res.add(mid);
      }
    }
  }
  return res;
}

describe("変換表の形式", () => {
  test("重複したキーがない", () => {
    expect(findDuplicateKeys(tableText)).toEqual([]);
  });

  test("促音: XX は「っ」を出し、X を次の入力に残す", () => {
    const bad = [...table.table]
      .filter(([k, e]) => e.out === "っ" && k.length === 2 && k[0] === k[1] && e.pend !== k[0])
      .map(([k]) => k);
    expect(bad).toEqual([]);
    expect(table.table.get("tch")).toEqual({ out: "っ", pend: "ch" });
  });

  test("基準になかった未完成の接頭辞ができていない", () => {
    const before = danglingPrefixes(base);
    const added = [...danglingPrefixes(table)].filter((p) => !before.has(p));
    expect(added).toEqual([]);
  });
});

describe("QWERTY 回帰", () => {
  test("QWERTY の打鍵列が、拡張を入れる前と同じかなになる", () => {
    const keys = [...base.table.keys()];
    const inputs = new Set(QWERTY_WORDS);
    for (const a of ["", ...keys]) {
      for (const b of keys) inputs.add(a + b);
    }
    const diffs = [];
    for (const s of inputs) {
      const x = flush(base, s);
      const y = flush(table, s);
      if (x === y) continue;
      // 基準でもアルファベットが残る列は QWERTY の打ち間違いなので対象外
      if (/[a-z]/.test(x) && x !== "w" && x !== "ww") continue;
      diffs.push(`${s}: 基準=${x} 対象=${y}`);
    }
    expect(diffs.slice(0, 40)).toEqual([]);
  });
});

describe("DvorakJP の拡張入力", () => {
  test.each(DVORAK_CASES)("%p → %p", (input, expected) => {
    expect(flush(table, input)).toBe(expected);
  });
});

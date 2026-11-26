// 練習ページのロジック（docs/romaji.js）のテスト
import { describe, expect, test } from "bun:test";
import {
  completion, compose, deletePending, flush, isExtensionKey, judge, loadTable, nextKeys, parseTable, parseText, plan, romajiLayout,
} from "../docs/romaji.js";
import { loadTableFile, readText, STANDARD_PATH } from "./helpers.js";
import { LAYOUTS, fingerOf } from "../docs/keymap.js";

const t = await loadTableFile();
const texts = JSON.parse(await readText(new URL("../docs/playground-texts.json", import.meta.url).pathname));

// キー列を1文字ずつ判定に通す。最後まで打ち切れたら done、ミスしたらその位置を返す
function typeAll(keys, target) {
  let typed = "";
  for (const [i, c] of [...keys].entries()) {
    const r = judge(t, typed, c, target);
    if (!r.ok) return { miss: i, typed };
    typed += c;
    if (r.done) return { done: i === keys.length - 1 };
  }
  return { done: false };
}

describe("変換", () => {
  test.each([
    ["konnnitiha", "こんにちは"],
    ["kyouha", "きょうは"],
    ["ky,ha", "きょうは"],
    ["vj", "ねん"],
    ["kka", "っか"],
  ])("%p → %p", (keys, kana) => {
    expect(flush(t, keys)).toBe(kana);
  });

  test("kon は n を保留する", () => {
    expect(compose(t, "kon")).toEqual({ committed: "こ", pending: "n" });
  });
});

describe("入力の判定", () => {
  test.each([
    ["konnnitiha", "こんにちは"],
    ["ky,ha", "きょうは"],
    ["h;v,", "はんのう"],
    ["hannnou", "はんのう"],
  ])("%p で %p を打ち切れる", (keys, kana) => {
    expect(typeAll(keys, kana)).toEqual({ done: true });
  });

  test.each([
    ["konnitiha", "こんにちは", 4], // n が足りない
    ["h;vu", "はんのう", 3], // のう を vu
  ])("%p は %p に対してミスになる", (keys, kana, at) => {
    expect(typeAll(keys, kana).miss).toBe(at);
  });
});

describe("拡張キーの判定", () => {
  const entry = (key) => t.table.get(key);

  test.each(["k'", "k-", "ky,", "vj", "phu", "pha", "kt", "ct", "ds", "tg", "shn", "ryn"])("%p は拡張キー", (key) => {
    expect(isExtensionKey(key, entry(key))).toBe(true);
  });

  test.each(["ka", "kya", "n", "nn", "n'", "kk", ";-"])("%p は拡張キーではない", (key) => {
    expect(isExtensionKey(key, entry(key))).toBe(false);
  });
});

describe("表示用のローマ字", () => {
  // 下段は標準の打ち方の単位（da と i など）で分かれるので、つなげて確かめる
  test.each([
    ["だい", "dai", [["d-", "d'"]]],
    ["ぴゅ", "pyu", [["phu"]]],
    ["きょう", "kyou", [["kl"]]], // gACT10 由来の短縮入力（cl・kl）が最短
  ])("%p は %p と表示し、全体が赤字でヒントは %p", (kana, romaji, hint) => {
    const segs = romajiLayout(t, kana);
    expect(segs.map((s) => s.key).join("")).toBe(romaji);
    expect(segs.every((s) => s.ext)).toBe(true);
    expect(segs[0].extKeys).toEqual(hint);
  });

  test("こんにちは は konnnitiha（n の後に n が続くので nn）", () => {
    expect(romajiLayout(t, "こんにちは").map((s) => s.key).join("")).toBe("konnnitiha");
  });

  // 同じ打鍵数の「の」でも、n で始まる no の前では「ん」が nn になり、v で始まる v, の前では n で済む。
  // 位置ごとに最良を1つだけ覚える方式だと、この違いを見落として nn no we（6打）を選んでいた
  test("んのうぇ は直前の「ん」まで見て最短の n v, le（5打）", () => {
    expect(plan(t, "んのうぇ", true).map((s) => s.key)).toEqual(["n", "v,", "le"]);
  });
});

describe("問題文の書式", () => {
  test("{表示|読み} を読みに分ける", () => {
    expect(parseText("{今日|きょう}は")).toEqual([
      { display: "今日", kana: "きょう" },
      { display: "は", kana: "は" },
    ]);
  });
});

describe.each(texts.map((x) => [x.genre, x]))("問題文「%s」", (_genre, text) => {
  const kana = parseText(text.text).map((x) => x.kana).join("");
  const layout = romajiLayout(t, kana);

  test("すべての文字を変換表で打てる", () => {
    expect(layout).not.toBeNull();
  });

  test("標準ローマ字で最後まで打ち切れる", () => {
    const keys = layout.map((s) => s.key).join("");
    expect(typeAll(keys, kana)).toEqual({ done: true });
  });

  test("拡張込みの打ち方で最後まで打ち切れ、打鍵数が標準以下になる", () => {
    const std = layout.map((s) => s.key).join("");
    const ext = plan(t, kana, true).map((s) => s.key).join("");
    expect(typeAll(ext, kana)).toEqual({ done: true });
    expect(ext.length).toBeLessThanOrEqual(std.length);
  });
});

describe("変換表の読み込み", () => {
  test("CRLF・空行・3列目（次の入力）を正しく読む", () => {
    const x = parseTable("ka\tか\r\n\r\nkk\tっ\tk\r\nkya\tきゃ\r\n");
    expect([...x.table.keys()]).toEqual(["ka", "kk", "kya"]);
    expect(x.table.get("kk")).toEqual({ out: "っ", pend: "k" });
    expect(x.table.get("ka")).toEqual({ out: "か", pend: "" });
    expect([...x.prefixes].sort()).toEqual(["k", "ky"]);
  });

  test("loadTable は fetch で読み込み、失敗したらエラーにする", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) => new URL(req.url).pathname === "/ok.txt"
        ? new Response("ka\tか\n")
        : new Response("Not Found", { status: 404 }),
    });
    try {
      const x = await loadTable(`${server.url}ok.txt`);
      expect(x.table.get("ka")).toEqual({ out: "か", pend: "" });
      await expect(loadTable(`${server.url}missing.txt`)).rejects.toThrow("404");
    } finally {
      server.stop(true);
    }
  });
});

describe("変換の細かい動き", () => {
  test.each([
    ["", ""],
    ["n", "ん"], // 末尾の n は確定時に「ん」
    ["kon", "こん"],
    ["tt", "っt"], // 促音の後に残った子音
    ["@a", "@あ"], // 変換表にない文字はそのまま
    ["kyt", "kyt"], // 未完成のまま行き詰まったら英字のまま残す
  ])("flush(%p) → %p", (keys, kana) => {
    expect(flush(t, keys)).toBe(kana);
  });

  test("促音: kk で「っ」を確定し、k を保留する", () => {
    expect(compose(t, "kk")).toEqual({ committed: "っ", pending: "k" });
  });
});

describe("入力の判定（細部）", () => {
  test("途中では done にならず、最後の1打で done になる", () => {
    expect(judge(t, "k", "a", "かん")).toEqual({ ok: true, committed: "か", pending: "", done: false });
    // 末尾の「ん」は n が保留のままでも、確定すれば一致するので完了
    expect(judge(t, "ka", "n", "かん")).toEqual({ ok: true, committed: "か", pending: "n", done: true });
  });

  test("1打目から違うキーはミス", () => {
    expect(judge(t, "", "s", "か")).toEqual({ ok: false });
  });

  test("促音は子音を重ねて打てる", () => {
    expect(typeAll("kka", "っか")).toEqual({ done: true });
    expect(typeAll("tyotto", "ちょっと")).toEqual({ done: true });
  });

  test("標準でも拡張でも、混ぜて打っても受け付ける", () => {
    expect(typeAll("kyouha", "きょうは")).toEqual({ done: true });
    expect(typeAll("k,ennmade", "こうえんまで")).toEqual({ done: true });
    expect(typeAll("vj", "ねん")).toEqual({ done: true });
  });
});

describe("Backspace（入力中のキーを消す）", () => {
  test("入力中のキーを1文字消せる", () => {
    expect(deletePending(t, "ky")).toEqual({ typed: "k", pending: "k" });
    expect(deletePending(t, "kan")).toEqual({ typed: "ka", pending: "" });
  });

  test.each([
    ["", "何も打っていない"],
    ["kyo", "すべて確定済み"],
    ["kk", "「っ」が確定済み（k を消すと「っ」まで消えてしまう）"],
  ])("%p は消せない（%s）", (typed) => {
    expect(deletePending(t, typed)).toBeNull();
  });
});

describe("下段に表示する標準ローマ字の選び方", () => {
  const romaji = (kana) => romajiLayout(t, kana)?.map((s) => s.key).join("") ?? null;

  test.each([
    ["かきくけこ", "kakikukeko"], // c ではなく k
    ["しち", "siti"], // 打鍵の少ない si / ti
    ["きゃ", "kya"], // cya ではなく kya
    ["じゃ", "ja"],
    ["を", "wo"],
    ["かんじ", "kanji"], // 子音の前の「ん」は n
    ["きんよう", "kinnyou"], // や行の前の「ん」は nn
    ["かんい", "kanni"], // 母音の前の「ん」は nn
    ["かん", "kan"], // 末尾の「ん」は n
    ["っか", "kka"],
    ["ちょっと", "tyotto"],
  ])("%p → %p", (kana, expected) => {
    expect(romaji(kana)).toBe(expected);
  });

  test.each(["っあ", "っな"])("%p: 子音を重ねられない促音は ltu / xtu で打つ", (kana) => {
    expect(romaji(kana)).toMatch(/^(ltu|xtu)/);
  });

  test.each(["！", "A", "漢"])("変換表で打てない文字 %p を含むと null", (kana) => {
    expect(romajiLayout(t, kana)).toBeNull();
  });
});

describe("拡張入力のまとまり（赤字とヒント）", () => {
  test("隣り合う別々の拡張は、別のまとまりになる", () => {
    const segs = romajiLayout(t, "こうこう");
    expect(segs.map((s) => [s.key, s.group])).toEqual([["ko", 0], ["u", 0], ["ko", 2], ["u", 2]]);
  });

  test("拡張で短くできない部分は赤字にしない", () => {
    const segs = romajiLayout(t, "かきくけこ");
    expect(segs.some((s) => s.ext)).toBe(false);
  });

  test("促音を含む拡張のヒントは、子音を重ねた打ち方になる", () => {
    const segs = romajiLayout(t, "っこう");
    expect(segs.map((s) => s.key).join("")).toBe("kkou");
    expect(segs[0].extKeys).toEqual([["kk,"]]);
  });
});

describe("問題文のデータ（docs/playground-texts.json）", () => {
  const ALLOWED_KANA = /^[ぁ-ゖー、。「」]+$/u;

  test("ジャンルが3つあり、id が重複しない", () => {
    expect(texts.length).toBe(3);
    expect(new Set(texts.map((x) => x.id)).size).toBe(texts.length);
    for (const x of texts) {
      expect(x.genre).toBeTruthy();
      expect(x.title).toBeTruthy();
    }
  });

  test.each(texts.map((x) => [x.genre, x]))("「%s」: {表示|読み} の書き間違いがない", (_genre, x) => {
    // 解釈した結果を書き戻して、元の文と一致すること（閉じ忘れなどで文字が消えていない）
    const rebuilt = parseText(x.text)
      .map((i) => (i.display === i.kana && i.kana.length === 1 ? i.kana : `{${i.display}|${i.kana}}`))
      .join("");
    expect(rebuilt).toBe(x.text);
  });

  test.each(texts.map((x) => [x.genre, x]))("「%s」: 読みはひらがなと 、。「」ー だけ", (_genre, x) => {
    const kana = parseText(x.text).map((i) => i.kana).join("");
    expect(kana).toMatch(ALLOWED_KANA);
    expect(kana.endsWith("。")).toBe(true);
  });
});

// 練習ページのキーボードの図: 次に打てるキーと、最短の打鍵数で打てるキー（拡張入力も使う）
describe("次に打てるキー", async () => {
  // 短縮入力が混ざらないよう、標準版の表で確かめる
  const std = await loadTableFile(STANDARD_PATH);
  const KEYS = "1234567890[]',.pyfgcrl/=aoeuidhtns-;qjkxbmwvz"; // Dvorak 配列のキーボードのキー
  const next = (typed, target) => {
    const r = nextKeys(std, typed, target, KEYS);
    const keys = (best) => r.filter((x) => x.best === best).map((x) => x.key).sort().join("");
    return { best: keys(true), other: keys(false) };
  };

  test.each([
    // く は c・k・q のどれでも打てる（kk は っ なので、k の後に k は打てない）
    ["", "く", "ckq", ""],
    // きょうは: ky, / cy, が最短。ki（き）の後に ょ を打つのは長い
    ["", "きょうは", "ck", ""],
    ["c", "きょうは", "y", "i"],
    ["cy", "きょうは", ",", "o"],
    // 拡張なしで途中まで打ったら、その続き（kyo きょ の後は u。wu でも う）
    ["kyo", "きょうは", "u", "w"],
    // ぴゅう: ph と py は同じ打鍵数（php / pyp）
    ["p", "ぴゅう", "hy", "i"],
    // 打ち終えたらなし
    ["ka", "か", "", ""],
  ])("%p まで打って %p: 最短は %p、ほかに %p", (typed, target, best, other) => {
    expect(next(typed, target)).toEqual({ best, other });
  });

  // 打鍵数が同じ最短の打ち方からは、同じ指の連続が少なく、左右の手を交互に打つものを1つ選ぶ（Dvorak 配列の指で）
  const finger = fingerOf(LAYOUTS.dvorak.rows);
  test.each([
    ["", "き", "c"], // ci（右→左）。ki は k・i が左の人差し指
    ["", "きゃ", "c"], // cya。kya は k・y が左の人差し指
    ["c", "きゃ", "y"],
    ["p", "ぴゅう", "h"], // php。pyp は p・y が左の人差し指
    ["s", "しゅう", "h"], // shp。syp は y・p が左の人差し指
    ["", "く", "c"], // cu。ku は k・u が左の人差し指、qu は左手だけ
  ])("%p まで打って %p: 優先するのは %p", (typed, target, key) => {
    const r = nextKeys(std, typed, target, KEYS, finger);
    expect(r.filter((x) => x.preferred).map((x) => x.key)).toEqual([key]);
  });

  test("優先するキーは、最短の打鍵数で打てるキーの中から1つだけ", () => {
    const r = nextKeys(std, "", "きょうは", KEYS, finger);
    expect(r.filter((x) => x.preferred).length).toBe(1);
    expect(r.find((x) => x.preferred).best).toBe(true);
  });

  test("保留中のキーからも、拡張入力を使う最短の続きを求める（せんせい を se まで打ったら n s.）", () => {
    expect(completion(std, "", "せんせい")).toBe("sjs.");
    expect(completion(std, "se", "せんせい")).toBe("sens.");
  });

  test.each([
    ["かんじ", "k;"],
    ["っか", "kk"],
    ["こんにちは", "k"],
  ])("保留中のキーの続き: %p を %p まで打った後も最後まで打てる", (kana, typed) => {
    expect(flush(std, completion(std, typed, kana))).toBe(kana);
  });

  test.each(texts.map((x) => [x.genre, x]))("「%s」を、最短のキーだけで、拡張入力を使う最短の打鍵数で最後まで打てる", (_genre, x) => {
    const kana = parseText(x.text).map((i) => i.kana).join("");
    const shortest = plan(std, kana, true, (key) => key.length).map((s) => s.key).join("").length;
    let typed = "";
    for (let n = 0; n < shortest; n++) {
      const best = nextKeys(std, typed, kana, KEYS).find((x) => x.best);
      expect(best.strokes).toBe(shortest - n);
      typed += best.key;
    }
    expect(flush(std, typed)).toBe(kana);
    expect(nextKeys(std, typed, kana, KEYS)).toEqual([]);
  });
});

// キーボード配列ごとのローマ字テーブルと、Dvorak 配列とのキーの対応。
// 変換スクリプト（tools/dvorak-to-qwerty.js）と練習ページの両方で使う。
//
// QWERTY 用のテーブルは、QWERTY 配列のキーボードで Dvorak 配列と同じ位置のキーを押すと
// 同じかなになるように、Dvorak 用のテーブルの入力の文字を置き換えたもの。
// Dvorak のキー位置は US 配列のキーボードを基準にする。

// 同じ位置にあるキーを、Dvorak の文字と QWERTY の文字で並べたもの
//   数字段の右2つ、上段、ホーム段、下段の順
const DVORAK = "[]" + "',.pyfgcrl/=" + "aoeuidhtns-" + ";qjkxbmwvz";
const US = "-=" + "qwertyuiop[]" + "asdfghjkl;'" + "zxcvbnm,./";
const JIS = "-^" + "qwertyuiop@[" + "asdfghjkl;:" + "zxcvbnm,./";

// Shift を押したときの文字
const DVORAK_SHIFT = "{}" + '"<>PYFGCRL?+' + "AOEUIDHTNS_" + ":QJKXBMWVZ";
const US_SHIFT = "_+" + "QWERTYUIOP{}" + 'ASDFGHJKL:"' + "ZXCVBNM<>?";
const JIS_SHIFT = "=~" + "QWERTYUIOP`{" + "ASDFGHJKL+*" + "ZXCVBNM<>?";

function pairs(from, to) {
  return [...from].map((c, i) => [c, to[i]]);
}

// 右下のキーが / ではなく - のキーボードでも打てるように、Dvorak の z を - でも打てるようにする
// （QWERTY の文字 → Dvorak の文字）
const EXTRA_KEYS = new Map([["-", "z"]]);

// QWERTY 版だけに足す、普通のローマ字（Google 日本語入力の標準）と同じ「点」の記号
// （QWERTY で打つキー → かな）。同じ記号を ; の位置のキーで打つ行のすぐ後に足す
const QWERTY_SYMBOLS = new Map([["z.", "…"], ["z,", "‥"], ["z/", "・"]]);

// suffix: ローマ字テーブルのファイル名で、版の後ろに付ける文字（tableFile を参照）
// map: Dvorak の文字 → そのキーで出る文字（Dvorak 用は null）
// extra: map とは別に、同じ Dvorak の文字として使える QWERTY の文字
// symbols: QWERTY 版だけに足す記号の行（QWERTY で打つキー → かな）
export const LAYOUTS = {
  "qwerty-jis": {
    label: "QWERTY(JIS)",
    suffix: "_qwerty_jis",
    // Dvorak の } は JIS 配列では ~ の位置になり、そのまま使う ~（〜）と重なるので対応させない
    map: new Map([...pairs(DVORAK, JIS), ...pairs(DVORAK_SHIFT, JIS_SHIFT).filter(([d]) => d !== "}")]),
    extra: EXTRA_KEYS,
    symbols: QWERTY_SYMBOLS,
  },
  "qwerty-us": {
    label: "QWERTY(US)",
    suffix: "_qwerty_us",
    map: new Map([...pairs(DVORAK, US), ...pairs(DVORAK_SHIFT, US_SHIFT)]),
    extra: EXTRA_KEYS,
    symbols: QWERTY_SYMBOLS,
  },
  dvorak: {
    label: "Dvorak",
    suffix: "",
    map: null,
  },
};

export const DEFAULT_LAYOUT = "qwerty-jis";

// DvorakJP lite のバージョン。版の名前に付ける
export const VERSION = "1.0";

// ローマ字テーブルの版（導入方法と練習のページで選ぶ）
//   standard: DvorakJP lite の拡張入力だけ（docs/romantable_dvorakjplite.txt を手で編集する）
//   abbr: standard に、AZIK・gACT10 由来の短縮入力（src/romantable/abbreviations.txt）を足したもの。
//         実験中で、予告なく変更することがある
// suffix: ローマ字テーブルのファイル名で、romantable_dvorakjplite の後ろに付ける文字
export const EDITIONS = {
  standard: {
    label: `DvorakJP lite v${VERSION}`,
    suffix: "",
    experimental: false,
  },
  abbr: {
    label: `DvorakJP lite v${VERSION} ＋ 短縮拡張`, // 公式ページでは「DvorakJP lite ＋ 短縮拡張」版
    suffix: "_abbr",
    experimental: true,
  },
};

export const DEFAULT_EDITION = "standard";

// 版とキーボード配列に合うローマ字テーブルのファイル名（docs/ の直下）
//   例: tableFile("abbr", "qwerty-jis") → romantable_dvorakjplite_abbr_qwerty_jis.txt
export function tableFile(edition, layout) {
  return `romantable_dvorakjplite${EDITIONS[edition].suffix}${LAYOUTS[layout].suffix}.txt`;
}

// 短縮拡張版の Dvorak 用の表: 標準版の表の後ろに短縮入力の行を足す
export function buildAbbrTable(standard, abbreviations) {
  return standard.replace(/\n*$/, "\n") + abbreviations.replace(/^\n+/, "");
}

// 対応表にない文字（数字や ~ など）はそのまま
export function convertKeys(keys, map) {
  if (!map) return keys;
  return [...keys].map((c) => map.get(c) ?? c).join("");
}

export function invert(map) {
  return map && new Map([...map].map(([d, q]) => [q, d]));
}

// テーブル全体を変換する（行の並び・空行・改行コードは元のまま）
export function convertTable(text, map) {
  return text
    .split("\n")
    .map((line) => {
      const cr = line.endsWith("\r") ? "\r" : "";
      const cols = (cr ? line.slice(0, -1) : line).split("\t");
      if (cols.length < 2) return line;
      cols[0] = convertKeys(cols[0], map);
      if (cols.length >= 3) cols[2] = convertKeys(cols[2], map);
      return cols.join("\t") + cr;
    })
    .join("\n");
}

// 行ごとに処理する。fn は列の配列を受け取り、出力する行（列の配列）の配列を返す
// 列のない行（空行など）はそのまま。改行コードは元のまま
function mapRows(text, fn) {
  return text
    .split("\n")
    .flatMap((line) => {
      const cr = line.endsWith("\r") ? "\r" : "";
      const cols = (cr ? line.slice(0, -1) : line).split("\t");
      if (cols.length < 2) return [line];
      return fn(cols).map((c) => c.join("\t") + cr);
    })
    .join("\n");
}

// QWERTY 用に作る前に、Dvorak 用の表を簡単にする（Dvorak 用のファイルは変えない）
//   - 「ア段＋い」は ' だけにする（同じかなになる X- を消す。単独の - や ;- は残す）
//   - 記号は ; だけにする（; でも打てる z の記号を消す）
//   - ' の後にさらにキーが続く行（t'i てぃ、t'u とぅ、t'yu てゅ、t'y など）を消し、
//     t' たい などが次のキーを待たずに確定するようにする
//   - ' 単独でも「ー」を打てるようにする（- の行の後に足す）
export function simplifyForQwerty(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [key, kana] = line.split("\t");
    if (kana !== undefined) out.set(key, kana);
  }
  const symbols = new Set([...out].filter(([key]) => key.startsWith(";")).map(([, kana]) => kana));
  return mapRows(text, (cols) => {
    const [key, kana] = cols;
    if (key.length >= 2 && key.endsWith("-") && out.get(key.slice(0, -1) + "'") === kana) return [];
    if (key.startsWith("z") && symbols.has(kana)) return [];
    if (key.slice(0, -1).includes("'")) return [];
    if (key === "-" && kana === "ー") return [cols, ["'", kana]];
    return [cols];
  });
}

// Dvorak 用の表から、QWERTY 用の表を作る
//   1. simplifyForQwerty で簡単にする
//   2. convertTable で、同じ位置のキーの文字に置き換える
//   3. extra のキーでも打てる行を、元の行のすぐ後に足す（例: /a ざ の後に -a ざ）
//   4. symbols の記号を、同じ記号を ; の位置のキーで打つ行のすぐ後に足す（例: ze … の後に z. …）
export function buildQwertyTable(text, layout) {
  const converted = convertTable(simplifyForQwerty(text), layout.map);
  const extra = [...(layout.extra ?? [])].map(([q, d]) => [layout.map.get(d), q]);
  const semicolon = layout.map.get(";");
  const symbols = [...(layout.symbols ?? [])];
  const keys = converted.split("\n").map((line) => line.split("\t")[0]);
  for (const [key] of symbols) {
    // 既にある打ち方と同じだったり、既にある打ち方の途中だったりしないこと
    if (keys.some((k) => k.startsWith(key))) throw new Error(`${key} は既にある打ち方と重なります`);
  }
  return mapRows(converted, (cols) => {
    const rows = [cols];
    for (const [from, to] of extra) {
      if (cols[0].includes(from)) rows.push(cols.map((c, i) => (i === 1 ? c : c.replaceAll(from, to))));
    }
    if (cols.length === 2 && cols[0].length === 2 && cols[0].startsWith(semicolon)) {
      for (const [key, kana] of symbols) if (cols[1] === kana) rows.push([key, kana]);
    }
    return rows;
  });
}

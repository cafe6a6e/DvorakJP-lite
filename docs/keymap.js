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

// map: Dvorak の文字 → そのキーで出る文字（Dvorak 用は null）
export const LAYOUTS = {
  "qwerty-jis": {
    label: "QWERTY(JIS)",
    file: "romantable_dvorakjplite_qwerty_jis.txt",
    // Dvorak の } は JIS 配列では ~ の位置になり、そのまま使う ~（〜）と重なるので対応させない
    map: new Map([...pairs(DVORAK, JIS), ...pairs(DVORAK_SHIFT, JIS_SHIFT).filter(([d]) => d !== "}")]),
  },
  "qwerty-us": {
    label: "QWERTY(US)",
    file: "romantable_dvorakjplite_qwerty_us.txt",
    map: new Map([...pairs(DVORAK, US), ...pairs(DVORAK_SHIFT, US_SHIFT)]),
  },
  dvorak: {
    label: "Dvorak",
    file: "romantable_dvorakjplite.txt",
    map: null,
  },
};

export const DEFAULT_LAYOUT = "qwerty-jis";

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

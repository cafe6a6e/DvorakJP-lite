// キーボード配列ごとに、ローマ字テーブルの文字をどの指で打つか。同指連続打鍵の計測（tools/keystrokes.js）で使う
// 指は、US 配列のキーボードのキー位置と、一般的なタッチタイピングの指の割り当てで決める
import { LAYOUTS } from "../docs/keymap.js";

// US 配列のキー位置（行ごと）。列の位置で指が決まる
const ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];
// 列 → 指（0〜3: 左の小指・薬指・中指・人差し指、6〜9: 右の人差し指・中指・薬指・小指）
const COLUMN_FINGER = [0, 1, 2, 3, 3, 6, 6, 7, 8, 9, 9, 9];
// Shift を押して打つ文字 → 同じキーの文字（US 配列）
const SHIFT = new Map([..."~!@#$%^&*()_+QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?"].map((c, i) =>
  [c, "`1234567890-=qwertyuiop[]asdfghjkl;'zxcvbnm,./"[i]]));

const POSITION_FINGER = new Map([["`", 0]]);
for (const row of ROWS) [...row].forEach((c, i) => POSITION_FINGER.set(c, COLUMN_FINGER[i]));

// 大西配列（https://o24.works/layout/）: US 配列のキー位置 → 出る文字。ほかのキーは QWERTY のまま
const ONISHI = new Map([
  ...pairsOf("qwertyuiop", "qlu,.fwryp"),
  ...pairsOf("asdfghjkl;", "eiao-ktnsh"),
  ...pairsOf("zxcvbnm,./", "zxcv;gdmjb"),
  ["-", "/"],
].map(([pos, c]) => [c, pos]));

function pairsOf(a, b) {
  return [...a].map((c, i) => [c, b[i]]);
}

// 打つ文字 → US 配列のキー位置
export const KEYBOARDS = {
  qwerty: { label: "QWERTY", position: (c) => c },
  dvorak: { label: "Dvorak", position: (c) => LAYOUTS["qwerty-us"].map.get(c) ?? c },
  // Shift の文字は、Shift を外した文字のキー（例: ? は / のキー）
  onishi: { label: "大西配列", position: (c) => { const u = SHIFT.get(c) ?? c; return ONISHI.get(u) ?? u; } },
};

// 打つ文字 → 指（0〜9）。キーボードにない文字は null
export function fingerOf(keyboard, c) {
  const pos = KEYBOARDS[keyboard].position(c);
  return POSITION_FINGER.get(SHIFT.get(pos) ?? pos) ?? null;
}

// 2つの文字を続けて打つとき、同じ指を使うか
export function sameFinger(keyboard, a, b) {
  const f = fingerOf(keyboard, a);
  return f !== null && f === fingerOf(keyboard, b);
}

// キー列 keys の中で、同じ指が続く回数（同じキーの連打を含む）と、そのうち同じキーの連打の回数
export function countSameFinger(keyboard, keys) {
  let sameFingerCount = 0, sameKey = 0;
  for (let i = 1; i < keys.length; i++) {
    if (!sameFinger(keyboard, keys[i - 1], keys[i])) continue;
    sameFingerCount++;
    if (keys[i - 1] === keys[i]) sameKey++;
  }
  return { sameFinger: sameFingerCount, sameKey };
}

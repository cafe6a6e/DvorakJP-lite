// テスト共通: 変換表ファイルの読み込み
import { parseTable } from "../docs/romaji.js";

const root = new URL("../", import.meta.url);

// 検査する Dvorak 用の変換表（標準版・短縮拡張版）
// 環境変数 ROMANTABLE で、標準版の代わりに別のファイルを指定できる（候補の表を試すとき用）
export const STANDARD_PATH = process.env.ROMANTABLE ?? new URL("docs/romantable_dvorakjplite.txt", root).pathname;
export const ABBR_PATH = new URL("docs/romantable_dvorakjplite_abbr.txt", root).pathname;

// QWERTY 回帰の基準: 拡張を入れる前の lite 変換表（コミット fcf1ce2 の版）
export const BASE_PATH = new URL("test/fixtures/qwerty-base.txt", root).pathname;

// 元祖 DvorakJP の変換表（「DvorakJP の解説」ページの例を確かめる用。コミット 6e717f8 で消した google-japanese-input/ の版）
export const ORIGINAL_PATH = new URL("test/fixtures/dvorakjp-original.txt", root).pathname;

export async function readText(path) {
  return Bun.file(path).text();
}

// 既定は、短縮入力も含む短縮拡張版（練習ページの表示や、サイトの例をすべて確かめられる）
export async function loadTableFile(path = ABBR_PATH) {
  return parseTable(await readText(path));
}

// 重複したキーを返す（parseTable は後の行で上書きするため、行単位で調べる）
export function findDuplicateKeys(text) {
  const seen = new Set();
  const dups = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const key = line.split("\t")[0];
    if (seen.has(key)) dups.push(key);
    seen.add(key);
  }
  return dups;
}

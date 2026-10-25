// テスト共通: 変換表ファイルの読み込み
import { parseTable } from "../docs/romaji.js";

const root = new URL("../", import.meta.url);

// 検査する変換表。環境変数 ROMANTABLE で別のファイルを指定できる（候補の表を試すとき用）
export const TABLE_PATH = process.env.ROMANTABLE ?? new URL("docs/romantable_dvorakjplite.txt", root).pathname;

// QWERTY 回帰の基準: 拡張を入れる前の lite 変換表（コミット fcf1ce2 の版）
export const BASE_PATH = new URL("test/fixtures/qwerty-base.txt", root).pathname;

export async function readText(path) {
  return Bun.file(path).text();
}

export async function loadTableFile(path = TABLE_PATH) {
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

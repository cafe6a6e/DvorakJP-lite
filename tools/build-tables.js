// 手で編集する表から、配布するローマ字テーブルを作る
//   bun run build
//
// 手で編集するのは次の 2 つだけ。
//   - docs/romantable_dvorakjplite.txt: 標準版（Dvorak 配列用）
//   - src/romantable/abbreviations.txt: 短縮拡張版で足す短縮入力
// 作るもの:
//   - 短縮拡張版（Dvorak 配列用）: 標準版の後ろに短縮入力を足す（buildAbbrTable）
//   - 両方の版の QWERTY 版（JIS 配列用・US 配列用）: Dvorak 用の表を簡単にしてから、
//     1列目（入力）と3列目（次の入力）の文字を「同じ位置にある QWERTY の文字」に置き換え、
//     右下の / の代わりに - でも打てる行を足す。2列目（出力）はそのまま。
//     手順とキーの対応は docs/keymap.js の buildQwertyTable にある。
import { EDITIONS, LAYOUTS, buildAbbrTable, buildQwertyTable, tableFile } from "../docs/keymap.js";

const root = new URL("../", import.meta.url);
export const pathOf = (edition, layout) => new URL(`docs/${tableFile(edition, layout)}`, root).pathname;
export const ABBREVIATIONS_PATH = new URL("src/romantable/abbreviations.txt", root).pathname;

// QWERTY 用（変換して作るもの）だけ
export const QWERTY_LAYOUTS = Object.entries(LAYOUTS).filter(([, layout]) => layout.map);

// 版ごとの Dvorak 用の表（standard はファイルのまま、abbr は作る）
export async function dvorakTables() {
  const standard = await Bun.file(pathOf("standard", "dvorak")).text();
  const abbreviations = await Bun.file(ABBREVIATIONS_PATH).text();
  return { standard, abbr: buildAbbrTable(standard, abbreviations) };
}

// 作るファイルの一覧: [パス, 中身]
export async function buildAll() {
  const sources = await dvorakTables();
  const files = [[pathOf("abbr", "dvorak"), sources.abbr]];
  for (const edition of Object.keys(EDITIONS)) {
    for (const [id, layout] of QWERTY_LAYOUTS) {
      files.push([pathOf(edition, id), buildQwertyTable(sources[edition], layout)]);
    }
  }
  return files;
}

if (import.meta.main) {
  for (const [path, text] of await buildAll()) {
    await Bun.write(path, text);
    console.log(`${path} を書き出しました`);
  }
}

// Dvorak 用のローマ字テーブルから、QWERTY 配列のまま使う版（JIS 配列用・US 配列用）を作る
//   bun run build:qwerty
//
// 1列目（入力）と3列目（次の入力）の文字を「同じ位置にある QWERTY の文字」に置き換える。
// 2列目（出力）はそのまま。キーの対応は docs/keymap.js にある。
import { LAYOUTS, convertTable } from "../docs/keymap.js";

const docs = new URL("../docs/", import.meta.url);
export const pathOf = (layout) => new URL(layout.file, docs).pathname;
export const SOURCE_PATH = pathOf(LAYOUTS.dvorak);

// QWERTY 用（変換して作るもの）だけ
export const QWERTY_LAYOUTS = Object.entries(LAYOUTS).filter(([, layout]) => layout.map);

if (import.meta.main) {
  const source = await Bun.file(SOURCE_PATH).text();
  for (const [, layout] of QWERTY_LAYOUTS) {
    await Bun.write(pathOf(layout), convertTable(source, layout.map));
    console.log(`${layout.label}: ${pathOf(layout)} を書き出しました`);
  }
}

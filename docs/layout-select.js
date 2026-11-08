// 「キーボード配列」と「版」の選択。導入方法と練習のページで共有し、選んだものはブラウザに覚えておく
import { createChoice } from "./choice.js";
import { DEFAULT_EDITION, DEFAULT_LAYOUT, EDITIONS, LAYOUTS } from "./keymap.js";

const layout = createChoice({
  storageKey: "dvorakjplite.layout",
  values: LAYOUTS,
  fallback: DEFAULT_LAYOUT,
  attr: "layout",
  selector: ".layout-select button",
});

const edition = createChoice({
  storageKey: "dvorakjplite.edition",
  values: EDITIONS,
  fallback: DEFAULT_EDITION,
  attr: "edition",
  selector: ".edition-select button",
});

export const currentLayout = layout.current;
// 選択が変わったら callback(layout) を呼ぶ
export const onLayoutChange = layout.onChange;

export const currentEdition = edition.current;
// 選択が変わったら callback(edition) を呼ぶ
export const onEditionChange = edition.onChange;

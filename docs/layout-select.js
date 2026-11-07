// 「キーボード配列」の選択。導入方法と練習のページで共有し、片方で選ぶともう片方も切り替わる
import { DEFAULT_LAYOUT, LAYOUTS } from "./keymap.js";

let current = DEFAULT_LAYOUT;
const listeners = [];

export function currentLayout() {
  return current;
}

// 選択が変わったら callback(layout) を呼ぶ
export function onLayoutChange(callback) {
  listeners.push(callback);
}

function updateButtons() {
  for (const b of document.querySelectorAll(".layout-select button")) {
    b.setAttribute("aria-pressed", String(b.dataset.layout === current));
  }
}

for (const b of document.querySelectorAll(".layout-select button")) {
  b.addEventListener("click", () => {
    if (!(b.dataset.layout in LAYOUTS) || b.dataset.layout === current) return;
    current = b.dataset.layout;
    updateButtons();
    for (const callback of listeners) callback(current);
  });
}
updateButtons();

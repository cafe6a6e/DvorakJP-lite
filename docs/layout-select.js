// 「キーボード配列」の選択。導入方法と練習のページで共有し、選んだ配列はブラウザに覚えておく
import { DEFAULT_LAYOUT, LAYOUTS } from "./keymap.js";

const STORAGE_KEY = "dvorakjplite.layout";

// 前に選んだ配列（覚えていなければ既定値）。ブラウザの保存が使えなくても動くようにする
function loadLayout() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v in LAYOUTS) return v;
  } catch {}
  return DEFAULT_LAYOUT;
}

function saveLayout(v) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {}
}

let current = loadLayout();
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
    saveLayout(current);
    updateButtons();
    for (const callback of listeners) callback(current);
  });
}
updateButtons();

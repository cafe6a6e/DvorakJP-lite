// 導入方法のページ（install/）: OS・キーボード配列の切り替えと、ローマ字テーブルのダウンロード

import { LAYOUTS } from "./keymap.js";
import { currentLayout, onLayoutChange } from "./layout-select.js";

// Google Analytics にイベントを送る（gtag が無い環境では何もしない）
function track(name, params) {
  if (typeof gtag === "function") gtag("event", name, params);
}

// 利用者の OS を推測する（分からなければ Windows）
function guessOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes("mac") || p.includes("iphone") || p.includes("ipad")) return "mac";
  if (p.includes("win")) return "windows";
  if (p.includes("linux") || p.includes("x11") || p.includes("cros")) return "linux";
  return "windows";
}

// 導入方法の選択（OS とキーボード配列）
// QWERTY は JIS配列と US配列で記号キーの位置が違うので、ローマ字テーブルを分けている
let os = guessOS();

function updateInstall() {
  const layout = currentLayout();
  for (const b of document.querySelectorAll("#install-os button")) {
    b.setAttribute("aria-pressed", String(b.dataset.os === os));
  }
  for (const panel of document.querySelectorAll(".os-panel")) {
    panel.hidden = panel.dataset.os !== os;
  }
  for (const note of document.querySelectorAll(".layout-note")) {
    note.hidden = note.dataset.layout !== layout;
  }
  // QWERTY 版だけの手順（Dvorak 版では , と . は句読点のままなので不要）
  for (const step of document.querySelectorAll(".qwerty-only")) {
    step.hidden = !LAYOUTS[layout].map;
  }
  // キーボード配列に合わせて、ダウンロードするローマ字テーブルを切り替える
  // ローマ字テーブルは docs/ の直下にあるので、このスクリプトの場所を基準にする
  const file = LAYOUTS[layout].file;
  document.getElementById("download-romantable").href = new URL(file, import.meta.url).href;
  for (const code of document.querySelectorAll(".romantable-name")) code.textContent = file;
}

for (const b of document.querySelectorAll("#install-os button")) {
  b.addEventListener("click", () => { os = b.dataset.os; updateInstall(); });
}
onLayoutChange(updateInstall);
updateInstall();

// ローマ字テーブルのダウンロード数を、選んでいた OS とキーボード配列付きで記録する
document.getElementById("download-romantable").addEventListener("click", () => {
  track("download_romantable", { os, layout: currentLayout() });
});

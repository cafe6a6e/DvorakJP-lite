// ページ切り替え（#about / #install / #playground）と、導入方法の OS 切り替え

const PAGES = ["about", "install", "playground"];

function showPage() {
  const id = location.hash.slice(1);
  const page = PAGES.includes(id) ? id : "about";
  for (const p of PAGES) {
    document.getElementById(`page-${p}`).hidden = p !== page;
  }
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

// 利用者の OS を推測する（分からなければ Windows）
function guessOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes("mac") || p.includes("iphone") || p.includes("ipad")) return "mac";
  if (p.includes("win")) return "windows";
  if (p.includes("linux") || p.includes("x11") || p.includes("cros")) return "linux";
  return "windows";
}

function selectOS(os) {
  for (const b of document.querySelectorAll(".os-switch button")) {
    b.setAttribute("aria-selected", String(b.dataset.os === os));
  }
  for (const panel of document.querySelectorAll(".os-panel")) {
    panel.hidden = panel.dataset.os !== os;
  }
}

const guessed = guessOS();
selectOS(guessed);

for (const b of document.querySelectorAll(".os-switch button")) {
  b.addEventListener("click", () => selectOS(b.dataset.os));
}

window.addEventListener("hashchange", showPage);
showPage();

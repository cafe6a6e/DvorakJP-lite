// 長いページ（「DvorakJP lite とは」「DvorakJP の解説」）の目次と、ページの先頭に戻るボタン
// 目次は <main> の id 付きの h2 から作り、横幅が足りるときだけ本文の右に表示する（style.css の .page-toc）

const main = document.querySelector("main");
const headings = [...main.querySelectorAll("h2[id]")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const scrollBehavior = () => (reduceMotion.matches ? "auto" : "smooth");

// 目次
const toc = document.createElement("nav");
toc.className = "page-toc";
toc.setAttribute("aria-label", "目次");
const title = document.createElement("p");
title.className = "page-toc-title";
title.textContent = "目次";
const list = document.createElement("ol");
const links = headings.map((h) => {
  const a = document.createElement("a");
  a.href = `#${h.id}`;
  a.textContent = h.textContent.trim();
  const li = document.createElement("li");
  li.append(a);
  list.append(li);
  return a;
});
toc.append(title, list);
main.after(toc);

// ページの先頭に戻るボタン。アイコン: Lucide「arrow-up」（ISC License, Copyright (c) Lucide Contributors 2022）
const toTop = document.createElement("button");
toTop.type = "button";
toTop.className = "to-top";
toTop.setAttribute("aria-label", "ページの先頭に戻る");
toTop.title = "ページの先頭に戻る";
toTop.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';
toTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
});
document.body.append(toTop);

// 今読んでいる節（見出しがヘッダーの下を通り過ぎた最後の h2）を目次で示し、少し下まで読んだらボタンを出す
const header = document.querySelector(".site-header");
function update() {
  const line = (header?.offsetHeight ?? 0) + 24;
  let current = -1;
  headings.forEach((h, i) => { if (h.getBoundingClientRect().top <= line) current = i; });
  // ページの最後まで来たら、最後の節を示す（短い最後の節の見出しが上まで来ないため）
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = headings.length - 1;
  links.forEach((a, i) => {
    if (i === current) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
  toTop.classList.toggle("show", scrollY > innerHeight * 0.6);
}
let queued = false;
const schedule = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; update(); });
};
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule);
update();

// 目次のリンクは、なめらかにスクロールする（動きを減らす設定のときはすぐ移る）
toc.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  const target = document.getElementById(a.hash.slice(1));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: scrollBehavior() });
  history.pushState(null, "", a.hash);
});

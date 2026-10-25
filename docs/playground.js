// 練習ページ（#playground）: 長文タイピング練習
import { loadTable, compose, judge, romajiLayout, parseText } from "./romaji.js";

const $ = (id) => document.getElementById(id);
const area = $("pg-area");
const statusEl = $("pg-status");
const textEl = $("pg-text");
const statsEl = $("pg-stats");
const genresEl = $("pg-genres");

let table = null;
let texts = [];
let state = null;
let timer = null;

// ---- 表示 ----

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `pg-status ${kind}`;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 問題文を「。」ごとに区切り、上段＝文章・下段＝ローマ字で描画する
function render(text) {
  const items = parseText(text.text);
  const sentences = [[]];
  for (const item of items) {
    sentences.at(-1).push(item);
    if (item.kana.endsWith("。")) sentences.push([]);
  }
  if (sentences.at(-1).length === 0) sentences.pop();

  textEl.replaceChildren();
  const spans = [];
  let offset = 0;
  for (const sentence of sentences) {
    const box = el("div", "pg-sentence");
    const jp = el("div", "pg-jp");
    const romaji = el("div", "pg-romaji");
    const kana = sentence.map((x) => x.kana).join("");

    let pos = offset;
    for (const item of sentence) {
      const s = el("span", "", item.display);
      spans.push({ el: s, start: pos, end: pos + item.kana.length, box });
      pos += item.kana.length;
      jp.append(s);
    }

    const layout = romajiLayout(table, kana);
    if (!layout) {
      console.warn("変換表で打てない文字が含まれています:", kana);
      romaji.textContent = "（この文は変換表で打てない文字を含みます）";
    } else {
      // 同じ拡張入力に属する赤字の部分は1つにまとめ、マウスを乗せると打ち方を出す
      let group = null;
      for (const seg of layout) {
        const s = el("span", "", seg.key);
        spans.push({ el: s, start: offset + seg.start, end: offset + seg.end, box });
        if (!seg.ext) {
          group = null;
          romaji.append(s);
          continue;
        }
        if (!group || group.dataset.group !== String(seg.group)) {
          group = el("span", "ext");
          group.dataset.group = String(seg.group);
          group.dataset.hint = `拡張入力: ${seg.extKeys.map((keys) => keys.join(" または ")).join("、")}`;
          romaji.append(group);
        }
        group.append(s);
      }
    }

    box.append(jp, romaji);
    textEl.append(box);
    offset += kana.length;
  }

  return { target: items.map((x) => x.kana).join(""), spans };
}

// 打ち終えた部分を薄く、今の位置に下線を引く
function updateProgress() {
  const c = state.committed.length;
  let currentBox = null;
  for (const s of state.spans) {
    const done = s.end <= c;
    const current = !done && s.start <= c;
    s.el.classList.toggle("done", done);
    s.el.classList.toggle("current", current);
    if (current) currentBox = s.box;
  }
  if (currentBox) scrollWithinArea(currentBox);
}

// 今の文が練習エリアの外に出たら、エリアの中だけをスクロールする（ページ全体は動かさない）
function scrollWithinArea(box) {
  const a = area.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (b.top < a.top || b.bottom > a.bottom) {
    area.scrollTop += b.top - a.top - 48;
  }
}

const MAX_MS = 999 * 1000; // 時間は 999 秒で止める

function updateStats() {
  const s = state;
  const elapsed = s.startedAt ? (s.finishedAt || performance.now()) - s.startedAt : 0;
  const ms = Math.min(elapsed, MAX_MS);
  if (elapsed >= MAX_MS) stopTimer();
  const total = s.correct + s.miss;
  const accuracy = total ? Math.round((s.correct / total) * 1000) / 10 : 100;
  const kps = (ms > 0 ? s.correct / (ms / 1000) : 0).toFixed(1); // 1秒あたりの打鍵数
  statsEl.textContent =
    `時間 ${Math.floor(ms / 1000)}秒 ・ 打鍵 ${s.correct} ・ ミス ${s.miss} ・ 正確率 ${accuracy}% ・ ${kps} 打鍵/秒`;
  return { ms, accuracy, kps };
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
}

// ---- 練習の開始 ----

function start(text) {
  stopTimer();
  for (const b of genresEl.querySelectorAll("button")) {
    b.setAttribute("aria-selected", String(b.dataset.id === text.id));
  }
  const { target, spans } = render(text);
  state = { text, target, spans, typed: "", committed: "", pending: "", correct: 0, miss: 0, startedAt: 0, finishedAt: 0 };
  textEl.scrollTop = 0;
  area.scrollTop = 0;
  updateProgress();
  updateStats();
  idleStatus();
}

function idleStatus() {
  if (!state || state.finishedAt) return;
  if (document.activeElement === area) {
    setStatus(state.startedAt ? "入力中…" : "打ち始めてください。");
  } else {
    setStatus("ここをクリックすると入力できます。");
  }
}

function flashMiss() {
  area.classList.remove("miss");
  void area.offsetWidth; // アニメーションをやり直すため
  area.classList.add("miss");
  setTimeout(() => area.classList.remove("miss"), 150);
}

// ---- キー入力 ----

function showPending() {
  setStatus(state.pending ? `入力中… ${state.pending}` : "入力中…");
}

// Backspace: まだかなに確定していない入力中のキーを1文字消す（確定したかなは消さない）
function deletePending() {
  if (!state.pending) return;
  const typed = state.typed.slice(0, -1);
  const r = compose(table, typed);
  if (r.committed !== state.committed) return;
  state.typed = typed;
  state.pending = r.pending;
  showPending();
}

function onKeyDown(e) {
  if (!state || state.finishedAt) return;

  // 日本語入力モード
  if (e.isComposing || e.key === "Process" || e.keyCode === 229) {
    e.preventDefault();
    setStatus("日本語入力がオンになっています。英字入力（直接入力）に切り替えてください。", "warn");
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    deletePending();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  e.preventDefault();

  const key = /^[A-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key;
  if (!state.startedAt) {
    state.startedAt = performance.now();
    timer = setInterval(updateStats, 100);
  }

  const r = judge(table, state.typed, key, state.target);
  if (!r.ok) {
    state.miss++;
    flashMiss();
    updateStats();
    return;
  }

  state.typed += key;
  state.committed = r.committed;
  state.pending = r.pending;
  state.correct++;
  showPending();

  if (r.done) {
    state.committed = state.target;
    state.finishedAt = performance.now();
    stopTimer();
    const { ms, accuracy, kps } = updateStats();
    setStatus(`完了しました。${Math.floor(ms / 1000)}秒、正確率 ${accuracy}%、${kps} 打鍵/秒。`, "done");
    if (typeof gtag === "function") {
      gtag("event", "playground_complete", { genre: state.text.id, kps: Number(kps), accuracy });
    }
  }
  updateProgress();
}

// ---- 初期化 ----

async function init() {
  try {
    const [t, list] = await Promise.all([
      loadTable("romantable_dvorakjplite.txt"),
      fetch("playground-texts.json").then((res) => {
        if (!res.ok) throw new Error(`問題文を読み込めませんでした (${res.status})`);
        return res.json();
      }),
    ]);
    table = t;
    texts = list;
  } catch (err) {
    setStatus(`読み込みに失敗しました: ${err.message}`, "warn");
    return;
  }

  for (const text of texts) {
    const b = el("button", "", text.genre);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.dataset.id = text.id;
    b.title = text.title;
    b.addEventListener("click", () => {
      start(text);
      area.focus();
    });
    genresEl.append(b);
  }

  $("pg-restart").addEventListener("click", () => {
    start(state.text);
    area.focus();
  });
  area.addEventListener("keydown", onKeyDown);
  area.addEventListener("focus", idleStatus);
  area.addEventListener("blur", idleStatus);

  start(texts[0]);
}

init();

// 練習ページ（playground/）: 長文タイピング練習
import { loadTable, parseTable, deletePending, judge, nextKeys, romajiLayout, parseText } from "./romaji.js";
import { LAYOUTS, convertKeys, fingerOf, invert, simplifyForQwerty, tableFile } from "./keymap.js";
import { currentEdition, currentLayout, onEditionChange, onLayoutChange } from "./layout-select.js";
import { track } from "./analytics.js";

const $ = (id) => document.getElementById(id);
const area = $("pg-area");
const statusEl = $("pg-status");
const textEl = $("pg-text");
const statsEl = $("pg-stats");
const genresEl = $("pg-genres");
const countEl = $("pg-count");
const keyboardEl = $("pg-keyboard");

// 下段のローマ字とヒントは、どのキーボード配列でも Dvorak 配列の文字で表示する（Dvorak 用の表で作る）。
// QWERTY 配列では、QWERTY 用の表と同じく簡単にした Dvorak 用の表で作る（QWERTY 用の表で打てない打ち方を出さないため）
let displayTable = null;
const dvorakTexts = new Map(); // 版ごとの Dvorak 用の表のテキスト（読み込み中は Promise）
const displayTables = new Map(); // 表示用の表（版と Dvorak 用 / QWERTY 用の組ごと）
// 入力の判定には、選んだキーボード配列と版のローマ字テーブルを使う
let table = null;
let toDvorak = null; // 押したキーの文字 → Dvorak 配列の文字（入力中の表示用）
const keyEls = new Map(); // キーボードの図のキー（押すキーの文字ごと）
let finger = null; // 押すキーの文字 → 指（打鍵数が同じ打ち方から、打ちやすいものを選ぶのに使う）
const tables = new Map(); // 読み込んだローマ字テーブル（ファイル名ごと）
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

// 問題文を「。」ごとに区切り、上段＝文章・下段＝ローマ字で描画する。
// 文は同じ場所に重ねて置き、今の文だけを見せる（練習エリアの高さは一番長い文に合い、文が変わっても同じ）
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
  const boxes = [];
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

    const layout = romajiLayout(displayTable, kana);
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
          group.dataset.hint = seg.extKeys.map((keys) => keys.join(" / ")).join("、");
          romaji.append(group);
        }
        group.append(s);
      }
    }

    box.append(jp, romaji);
    textEl.append(box);
    offset += kana.length;
    boxes.push({ el: box, end: offset });
  }

  return { target: items.map((x) => x.kana).join(""), spans, boxes };
}

// 打ち終えた部分を薄く、今の位置に下線を引き、今の文を見せる
function updateProgress() {
  const c = state.committed.length;
  for (const s of state.spans) {
    const done = s.end <= c;
    s.el.classList.toggle("done", done);
    s.el.classList.toggle("current", !done && s.start <= c);
  }
  // 打ち終えたら最後の文を見せたままにする
  const i = Math.max(0, state.finishedAt ? state.boxes.length - 1 : state.boxes.findIndex((b) => b.end > c));
  state.boxes.forEach((b, j) => b.el.classList.toggle("active", j === i));
  countEl.textContent = `${i + 1} / ${state.boxes.length}`;
  updateNextKey();
}

// ---- キーボードの図 ----

// 選んだキーボード配列のキーを並べる。行ごとに右へずらす量（キー 1/4 個分の単位）
const ROW_OFFSETS = [0, 2, 3, 5];
// ホームポジションの目印を付けるキー（ホーム段の左から4つ目と7つ目）
const HOME_KEYS = [3, 6];

function renderKeyboard(rows) {
  keyboardEl.replaceChildren();
  keyEls.clear();
  rows.forEach((row, r) => {
    [...row].forEach((c, i) => {
      const k = el("span", "pg-key", c);
      k.style.gridRow = String(r + 1);
      k.style.gridColumn = `${ROW_OFFSETS[r] + i * 4 + 1} / span 4`;
      if (r === 2 && HOME_KEYS.includes(i)) k.classList.add("home");
      keyboardEl.append(k);
      keyEls.set(c, k);
    });
  });
}

// 次に打てるキーをすべて薄い赤で示し、最後まで最短の打鍵数で打てるキー（拡張入力も使う）を濃い赤で示す。
// 最短のキーが複数あれば、同じ指の連続が少なく、左右の手を交互に打つものを1つだけ選ぶ
function updateNextKey() {
  const candidates = state && !state.finishedAt ? nextKeys(table, state.typed, state.target, keyEls.keys(), finger) : [];
  for (const k of keyEls.values()) k.classList.remove("cand", "best");
  for (const { key, preferred } of candidates) keyEls.get(key).classList.add(preferred ? "best" : "cand");
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
    b.setAttribute("aria-pressed", String(b.dataset.id === text.id));
  }
  const { target, spans, boxes } = render(text);
  state = { text, target, spans, boxes, typed: "", committed: "", pending: "", correct: 0, miss: 0, startedAt: 0, finishedAt: 0 };
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
  const pending = convertKeys(state.pending, toDvorak);
  setStatus(pending ? `入力中… ${pending}` : "入力中…");
}

// Backspace: まだかなに確定していない入力中のキーを1文字消す
function onBackspace() {
  const r = deletePending(table, state.typed);
  if (!r) return;
  state.typed = r.typed;
  state.pending = r.pending;
  showPending();
  updateNextKey();
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
    onBackspace();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  e.preventDefault();

  const key = /^[A-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key;
  if (!state.startedAt) {
    state.startedAt = performance.now();
    timer = setInterval(updateStats, 100);
    // 打ち始めた数（playground_complete と比べて、最後まで打った割合を見る）
    track("playground_start", { genre: state.text.id, layout: currentLayout(), edition: currentEdition() });
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
    track("playground_complete", { genre: state.text.id, layout: currentLayout(), edition: currentEdition(), kps: Number(kps), accuracy });
  }
  updateProgress();
}

// ---- キーボード配列 ----

// docs/ の直下にあるファイルの URL（練習ページは playground/ の下にあるので、このスクリプトの場所を基準にする）
function asset(file) {
  return new URL(file, import.meta.url).href;
}

async function getTable(file) {
  if (!tables.has(file)) tables.set(file, loadTable(asset(file)));
  return tables.get(file);
}

async function getDisplayTable(edition, layout) {
  if (!dvorakTexts.has(edition)) {
    dvorakTexts.set(edition, fetch(asset(tableFile(edition, "dvorak"))).then((res) => {
      if (!res.ok) throw new Error(`変換表を読み込めませんでした (${res.status})`);
      return res.text();
    }));
  }
  const kind = `${edition}:${layout.map ? "qwerty" : "dvorak"}`;
  if (!displayTables.has(kind)) {
    displayTables.set(kind, dvorakTexts.get(edition).then((text) => parseTable(layout.map ? simplifyForQwerty(text) : text)));
  }
  return displayTables.get(kind);
}

// 選んだキーボード配列と版のローマ字テーブルに切り替える
async function useTables() {
  const id = currentLayout();
  const edition = currentEdition();
  const layout = LAYOUTS[id];
  const [t, d] = await Promise.all([getTable(tableFile(edition, id)), getDisplayTable(edition, layout)]);
  if (id !== currentLayout() || edition !== currentEdition()) return false; // 読み込み中に別のものが選ばれた
  table = t;
  displayTable = d;
  toDvorak = invert(layout.map);
  renderKeyboard(layout.rows);
  finger = fingerOf(layout.rows);
  return true;
}

// 練習中に切り替えたら、同じ問題文を最初からやり直す
async function onTablesChange() {
  let ok;
  try {
    ok = await useTables();
  } catch (err) {
    setStatus(`読み込みに失敗しました: ${err.message}`, "warn");
    return;
  }
  if (ok && state) start(state.text);
}
onLayoutChange(onTablesChange);
onEditionChange(onTablesChange);

// ---- 初期化 ----

async function init() {
  try {
    const [list] = await Promise.all([
      fetch(asset("playground-texts.json")).then((res) => {
        if (!res.ok) throw new Error(`問題文を読み込めませんでした (${res.status})`);
        return res.json();
      }),
      useTables(),
    ]);
    texts = list;
  } catch (err) {
    setStatus(`読み込みに失敗しました: ${err.message}`, "warn");
    return;
  }

  for (const text of texts) {
    const b = el("button", "", text.genre);
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
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

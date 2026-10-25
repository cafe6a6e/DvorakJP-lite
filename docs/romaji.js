// DvorakJP lite の変換表を使った、ローマ字→かな変換と判定のロジック。
// 画面（DOM）には依存しないので、node からも import してテストできる。

// ---- 変換表 ----

// 変換表（TSV: キー・出力・次の入力）を読み込む
export function parseTable(text) {
  const table = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [key, out = "", pend = ""] = line.split("\t");
    table.set(key, { out, pend });
  }
  const prefixes = new Set();
  for (const key of table.keys()) {
    for (let i = 1; i < key.length; i++) prefixes.add(key.slice(0, i));
  }
  return { table, prefixes, entries: [...table] };
}

export async function loadTable(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`変換表を読み込めませんでした (${res.status})`);
  return parseTable(await res.text());
}

// ---- 変換エンジン（Google日本語入力 / Mozc の動きの近似）----

// keys を打ったときの結果。committed = 確定したかな、pending = 保留中のキー
function run(t, keys, flushAtEnd) {
  const out = [];
  const queue = [...keys];
  let p = "";

  // 行き詰まった保留 p を確定する
  const flushPending = () => {
    const e = t.table.get(p);
    if (e) {
      out.push(e.out);
      queue.unshift(...e.pend);
    } else {
      // 未完成の接頭辞: 先頭1文字をそのまま出し、残りを打ち直す
      out.push(p[0]);
      queue.unshift(...p.slice(1));
    }
    p = "";
  };

  for (;;) {
    if (queue.length === 0) {
      if (flushAtEnd && p) {
        flushPending();
        continue;
      }
      break;
    }
    const c = queue.shift();
    const k = p + c;
    if (t.prefixes.has(k)) {
      p = k;
    } else if (t.table.has(k)) {
      const e = t.table.get(k);
      out.push(e.out);
      p = "";
      queue.unshift(...e.pend);
    } else if (!p) {
      out.push(c);
    } else {
      queue.unshift(c);
      flushPending();
    }
  }
  return { committed: out.join(""), pending: p };
}

export function compose(t, keys) {
  return run(t, keys, false);
}

export function flush(t, keys) {
  return run(t, keys, true).committed;
}

// ---- 入力の判定 ----

// 保留中のキー pending から、残りのかな rest の先頭を打てる見込みがあるか
function isPromising(t, pending, rest) {
  if (!pending) return true;
  for (const [key, e] of t.entries) {
    if (e.out && key.startsWith(pending) && rest.startsWith(e.out)) return true;
  }
  return false;
}

// 入力済みのキー typed に key を足したとき、問題文 target に沿っているか
export function judge(t, typed, key, target) {
  const keys = typed + key;
  const { committed, pending } = compose(t, keys);
  if (!target.startsWith(committed)) return { ok: false };
  if (!isPromising(t, pending, target.slice(committed.length))) return { ok: false };
  return { ok: true, committed, pending, done: flush(t, keys) === target };
}

// Backspace: まだかなに確定していない入力中のキーを1文字消す（確定したかなは消さない）
// 消せたら { typed, pending }、消せなければ null を返す
export function deletePending(t, typed) {
  const cur = compose(t, typed);
  if (!cur.pending) return null;
  const next = typed.slice(0, -1);
  const r = compose(t, next);
  if (r.committed !== cur.committed) return null;
  return { typed: next, pending: r.pending };
}

// ---- 表示用のローマ字 ----

const KANA = /^[ぁ-ゟー]+$/;
const EXT_LAST = "'-;.,pkjqx";

// 拡張キーか（例: k' かい、ky, きょう、vj ねん、phu ぴゅ）
export function isExtensionKey(key, e) {
  if (e.pend || !KANA.test(e.out)) return false;
  if (key.startsWith("ph")) return true; // lite 独自の h 拗音（ぴゃ行）
  return key.length >= 2 && EXT_LAST.includes(key.at(-1)) && e.out !== "ん";
}

// 同じかなを同じ打鍵数で打てる別名（例: d- と d'）。最後の1文字だけが違う拡張キー
function aliases(t, key) {
  const e = t.table.get(key);
  if (!e) return [key];
  const head = key.slice(0, -1);
  return t.entries
    .filter(([k, x]) => k.length === key.length && k.startsWith(head) && x.out === e.out && isExtensionKey(k, x))
    .map(([k]) => k)
    .sort((a, b) => Number(a.endsWith("'")) - Number(b.endsWith("'")));
}

// 打鍵数が同じとき、QWERTY の一般的な打ち方を優先するための小さな減点
function penalty(key) {
  return /^(c|q|l|x)/.test(key) || key.includes("'") ? 0.1 : 0;
}

// key の直後に first（次のキーの1文字目）が来ても、key がそのまま確定するか
function isSafe(t, key, first) {
  if (first === null || !t.prefixes.has(key)) return true;
  const k = key + first;
  return !t.prefixes.has(k) && !t.table.has(k);
}

// かな列 kana を打つ、打鍵数が最小の打ち方を求める（後ろからの動的計画法）
// 戻り値: [{ start, end, key, ext }]（start/end はかなの位置）。打てない場合は null
export function plan(t, kana, allowExt) {
  const keys = t.entries.filter(([key, e]) =>
    e.out && !e.pend && (allowExt || !isExtensionKey(key, e)));
  const n = kana.length;
  const best = new Array(n + 1).fill(null);
  best[n] = { cost: 0, first: null };

  for (let i = n - 1; i >= 0; i--) {
    let b = null;
    const consider = (key, end, ext) => {
      const next = best[end];
      if (!next || !isSafe(t, key, next.first)) return;
      // 拡張込みのときは、打鍵数が同じなら拡張の打ち方を選ぶ（例: pyu より phu）
      const cost = key.length + penalty(key) - (allowExt && ext ? 0.05 : 0) + next.cost;
      if (!b || cost < b.cost) b = { cost, first: key[0], seg: { start: i, end, key, ext } };
    };
    for (const [key, e] of keys) {
      if (kana.startsWith(e.out, i)) consider(key, i + e.out.length, isExtensionKey(key, e));
    }
    // 促音「っ」: 変換表の XX → っ（次の入力 X）を使い、次のキーの子音を重ねる
    if (kana[i] === "っ") {
      for (const [key, e] of keys) {
        const c = key[0];
        const dbl = t.table.get(c + c);
        if (!/[b-df-hj-np-tv-z]/.test(c) || !dbl || dbl.out !== "っ" || dbl.pend !== c) continue;
        if (kana.startsWith(e.out, i + 1)) {
          consider(c + key, i + 1 + e.out.length, isExtensionKey(key, e));
        }
      }
    }
    best[i] = b;
  }

  if (!best[0]) return null;
  const segs = [];
  for (let i = 0; i < n; i = best[i].seg.end) segs.push(best[i].seg);
  return segs;
}

// 下段に表示するローマ字。標準の打ち方を基本に、拡張入力で短くできる部分に印を付ける
// 戻り値: [{ start, end, key, ext, extKeys, group }]。extKeys は拡張での打ち方（別名を含む）の一覧、
// group は同じ拡張入力に属する部分で共通の番号。
// 打てない文字があれば null
export function romajiLayout(t, kana) {
  const std = plan(t, kana, false);
  const ext = plan(t, kana, true);
  if (!std || !ext) return null;
  const extSegs = ext.filter((s) => s.ext);
  return std.map((s) => {
    const hits = extSegs.filter((x) => x.start < s.end && s.start < x.end);
    const extKeys = hits.map((x) => aliases(t, x.key));
    return { ...s, ext: hits.length > 0, extKeys, group: hits.length ? hits[0].start : null };
  });
}

// ---- 問題文 ----

// 「{今日|きょう}は」形式を [{ display, kana }] に分ける
export function parseText(src) {
  const items = [];
  const re = /\{([^|}]+)\|([^}]+)\}|([^{])/gu;
  for (const m of src.matchAll(re)) {
    if (m[3] !== undefined) items.push({ display: m[3], kana: m[3] });
    else items.push({ display: m[1], kana: m[2] });
  }
  return items;
}

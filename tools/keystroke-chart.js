// 打鍵効率と同指連続打鍵率のグラフ（インライン SVG）と数値の表を作り、docs/index.html と README.md の印の間に書き込む
//   bun tools/keystroke-chart.js   docs/data/keystrokes.json から作り直す
// tools/keystrokes.js の計測の最後にも呼ばれる。
const root = new URL("../", import.meta.url).pathname;
const PAGE = root + "docs/index.html";
const README = root + "README.md";
// 書き込む場所の印。keystroke-chart は打鍵効率、same-finger-chart は同指連続打鍵率
const marks = (id) => ({ start: `<!-- ${id}:start（tools/keystroke-chart.js が生成） -->`, end: `<!-- ${id}:end -->` });
const EFFICIENCY = marks("keystroke-chart");
const SAME_FINGER = marks("same-finger-chart");

// 系列ごとの見た目。lite を強調色に、比較対象は灰色にする。
// light は同指連続打鍵率のグラフで「同指同キー」の部分に使う淡い色。hatch は斜線の模様（短縮拡張）
const STYLE = {
  "QWERTY": { fill: "#c9c9c9", light: "#e8e8e8" },
  "大西配列": { fill: "#6e6e6e", light: "#bdbdbd" },
  "AZIK": { fill: "#ababab", light: "#dadada" },
  "DvorakJP": { fill: "#8c8c8c", light: "#c9c9c9" },
  "DvorakJP lite": { fill: "#d7263d", light: "#f2a9b2", strong: true },
  "DvorakJP lite ＋ 短縮拡張": { hatch: true, exp: true },
};
// 打鍵効率での表示名。QWERTY の変換表は、QWERTY・Dvorak・大西配列のどのキーボードでも打鍵数が同じなので「通常ローマ字」と呼ぶ
const EFFICIENCY_LABEL = { QWERTY: "通常ローマ字" };
const effLabel = (n) => EFFICIENCY_LABEL[n] ?? n;

const fillOf = (st, prefix, light = false) =>
  st.hatch ? `url(#${prefix}-hatch${light ? "-light" : ""})` : (light ? st.light : st.fill) ?? "#8c8c8c";

// 斜線の模様（濃い・淡い）。prefix はページ内で id が重ならないようにするため
const hatchDefs = (prefix) => `<defs>${[["", "#f6c3ca", "#d7263d"], ["-light", "#fdecee", "#ee9aa5"]].map(([id, bg, fg]) =>
  `<pattern id="${prefix}-hatch${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${bg}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${fg}" stroke-width="2.5"/></pattern>`).join("")}</defs>`;

// 棒の下の系列名（「＋ 短縮拡張」は 2 行目にしてフラスコを付ける）
function nameLabel(name, cx, y, st) {
  const [l1, l2] = name.split(" ＋ ");
  const out = [`<text x="${cx}" y="${y}" text-anchor="middle" class="kc-label${st.strong ? " kc-strong" : ""}">${esc(l1)}</text>`];
  if (l2) {
    out.push(`<text x="${cx - 8}" y="${y + 18}" text-anchor="middle" class="kc-label">＋ ${esc(l2)}</text>`);
    out.push(`<svg x="${cx + 32}" y="${y + 6}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d7263d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>Experimental（実験中）</title>${FLASK_PATHS}</svg>`);
  }
  return out;
}

// 表の見出し（「＋」の前で改行して、列を狭くする）
const headCell = (n, label = n) => `<th>${label.split(" ＋ ").map(esc).join("<br>＋ ")}${STYLE[n]?.exp ? ` ${FLASK_ICON}` : ""}</th>`;

// フラスコのアイコン: Lucide「flask-conical」（ISC License, Copyright (c) Lucide Contributors 2022）
const FLASK_PATHS = '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>';
const FLASK_ICON = `<svg class="exp-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Experimental"><title>Experimental（実験中）</title>${FLASK_PATHS}</svg>`;

const fmt = (n) => n.toLocaleString("en-US");
const f3 = (x) => x.toFixed(4);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// 上だけ角を丸めた棒
function bar(x, y, w, h, r = 4) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// 合計の打鍵効率が低い順の系列名（グラフと表の並び）。
// 前の系列と同じ変換表でキーボードだけが違う系列（大西配列）は、打鍵効率が同じなので載せない
const order = (total) => total.series.filter((s) => !s.sameTableAs)
  .sort((a, b) => a.efficiency - b.efficiency).map((s) => s.name);
const sorted = (series, names) => names.map((n) => series.find((s) => s.name === n));

export function renderSvg(total) {
  total = { ...total, series: sorted(total.series, order(total)) };
  const W = 640, H = 350;
  const L = 48, R = 624, T = 28, B = 300; // 棒グラフの領域
  const max = Math.ceil(Math.max(...total.series.map((s) => s.efficiency)) * 10) / 10;
  const y = (v) => B - (v / max) * (B - T);
  const band = (R - L) / total.series.length;
  const bw = 72;
  const out = [];

  out.push(`<svg class="kc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="kc-title kc-desc">`);
  out.push(`<title id="kc-title">配列ごとの打鍵効率</title>`);
  out.push(`<desc id="kc-desc">${esc(total.series.map((s) => `${effLabel(s.name)} ${f3(s.efficiency)}`).join("、"))}</desc>`);
  out.push(hatchDefs("kc"));

  // 目盛りと補助線
  for (let v = 0; v <= max + 1e-9; v += 0.1) {
    const yy = y(v).toFixed(1);
    out.push(`<line x1="${L}" x2="${R}" y1="${yy}" y2="${yy}" stroke="${v === 0 ? "var(--fg)" : "var(--line)"}" stroke-width="1"/>`);
    out.push(`<text x="${L - 8}" y="${yy}" dy="0.35em" text-anchor="end" class="kc-tick">${v.toFixed(1)}</text>`);
  }
  out.push(`<text x="${L - 40}" y="${T - 12}" class="kc-tick">打鍵効率（文字/打）</text>`);

  // 棒
  total.series.forEach((s, i) => {
    const st = STYLE[s.name] ?? { fill: "#8c8c8c" };
    const cx = L + band * (i + 0.5);
    const top = y(s.efficiency);
    out.push(`<g class="kc-bar"><title>${esc(effLabel(s.name))}: 打鍵効率 ${s.efficiency.toFixed(4)}（${fmt(s.strokes)} 打）</title>`);
    out.push(`<rect x="${(cx - band / 2 + 2).toFixed(1)}" y="${T}" width="${(band - 4).toFixed(1)}" height="${B - T}" fill="transparent"/>`);
    out.push(`<path d="${bar(cx - bw / 2, top, bw, B - top)}" fill="${fillOf(st, "kc")}"${st.exp ? ' stroke="#d7263d" stroke-width="1.5"' : ""}/>`);
    out.push(`<text x="${cx}" y="${top - 8}" text-anchor="middle" class="kc-value${st.strong ? " kc-strong" : ""}">${f3(s.efficiency)}</text>`);
    out.push(...nameLabel(effLabel(s.name), cx, B + 20, st));
    out.push(`</g>`);
  });

  out.push(`</svg>`);
  return out.join("\n");
}

export function renderTable(result) {
  const names = order(result.total);
  const head = names.map((n) => headCell(n, effLabel(n))).join("");
  const row = (label, c) =>
    `<tr><th>${label}</th><td>${fmt(c.used)}</td>${sorted(c.series, names).map((s) => `<td>${f3(s.efficiency)}</td>`).join("")}</tr>`;
  const corpusLabel = (c) => `<a href="${c.source}">${esc(c.name)}</a>`;
  return [
    `<div class="table-wrap">`,
    `<table class="kc-table">`,
    `<thead><tr><th>コーパス</th><th>文</th>${head}</tr></thead>`,
    `<tbody>`,
    ...result.corpora.map((c) => row(corpusLabel(c), c)),
    row("合計", result.total),
    `</tbody>`,
    `</table>`,
    `</div>`,
  ].join("\n");
}

// 出典の注記で使うコーパスの正式名
const TITLES = {
  ITA: "ITA コーパス",
  livedoor: "livedoor ニュースコーパス",
  Wikipedia: "京都大学 Wikipedia 注釈コーパス",
};

// 計測に使ったコーパスの出典とライセンス、計測方法
export function renderSources(result) {
  const list = result.corpora.map((c) => `<a href="${c.source}">${esc(TITLES[c.name] ?? c.name)}</a>（${esc(c.license)}）`).join("、");
  return `    <p class="note">日本語の文章（${list}）で計測。英字・数字を含む文は除く。通常ローマ字は Google 日本語入力の標準に近いローマ字テーブルで、打鍵効率は QWERTY・Dvorak・大西配列のどのキーボード配列でも同じ。AZIK のローマ字テーブルは <a href="https://note.com/actbemu/n/n74f1c04c9a2e">AZIK総合解説書</a>の仕様による。計測スクリプト： <a href="https://github.com/cafe6a6e/DvorakJP-lite/blob/main/tools/keystrokes.js">tools/keystrokes.js</a></p>`;
}

// ページの印の間に入れる HTML
export function renderSection(result) {
  return [
    `<figure class="kc-figure">`,
    renderSvg(result.total),
    `</figure>`,
    `<details class="kc-details">`,
    `<summary>コーパス別の打鍵効率</summary>`,
    renderTable(result),
    renderSources(result),
    `</details>`,
  ].join("\n");
}

// 印の間（今の内容）。mark を省くと打鍵効率の印
export function currentSection(text, mark = EFFICIENCY) {
  const a = text.indexOf(mark.start), b = text.indexOf(mark.end);
  if (a < 0 || b < 0) throw new Error(`グラフの印がない: ${mark.start}`);
  return text.slice(a + mark.start.length, b).trim();
}

// README の打鍵効率の表（合計、低い順）
export function renderReadme(result) {
  const t = result.total;
  const rows = sorted(t.series, order(t)).map((s) =>
    `| ${effLabel(s.name)}${STYLE[s.name]?.exp ? "（Experimental）" : ""} | ${f3(s.efficiency)} |`);
  return [
    "| ローマ字テーブル | 打鍵効率 |",
    "|---|--:|",
    ...rows,
  ].join("\n");
}

function replaceSection(text, mark, body, indent = "") {
  currentSection(text, mark);
  const a = text.indexOf(mark.start), b = text.indexOf(mark.end);
  return text.slice(0, a + mark.start.length) + "\n" + body + "\n" + indent + text.slice(b);
}

export async function writeChart(result) {
  let page = await Bun.file(PAGE).text();
  page = replaceSection(page, EFFICIENCY, renderSection(result), "    ");
  page = replaceSection(page, SAME_FINGER, renderSameFingerSection(result), "    ");
  await Bun.write(PAGE, page);
  let readme = await Bun.file(README).text();
  readme = replaceSection(readme, EFFICIENCY, renderReadme(result));
  readme = replaceSection(readme, SAME_FINGER, renderSameFingerReadme(result));
  await Bun.write(README, readme);
}

// ---- 同指連続打鍵率 ----

export { SAME_FINGER };
const pct = (x) => (x * 100).toFixed(2);
// 同指異キー（同じ指で別のキー）と同指同キー（同じキーの連打）の割合
const parts = (s) => ({ other: (s.sameFinger - s.sameKey) / s.strokes, same: s.sameKey / s.strokes, total: s.sameFinger / s.strokes });
// 合計の同指連続打鍵率が高い順（左ほど悪く、右ほど良い。打鍵効率のグラフと向きをそろえる）
const sfOrder = (total) => [...total.series].sort((a, b) => b.sameFingerRate - a.sameFingerRate).map((s) => s.name);

// 積み上げ棒グラフ。下が同指異キー（濃い色）、上が同指同キー（淡い色）
export function renderSameFingerSvg(total) {
  const series = sorted(total.series, sfOrder(total));
  const W = 640, H = 350;
  const L = 44, R = 636, T = 28, B = 300; // 系列が 6 つあるので、打鍵効率のグラフより横に広く使う
  // 最大値の上に合計の値を書く余白を残し、1% 単位で切り上げる
  const max = Math.ceil(Math.max(...series.map((s) => parts(s).total)) * 100 + 0.5) / 100;
  const y = (v) => B - (v / max) * (B - T);
  const band = (R - L) / series.length;
  const bw = 64, gap = 2;
  const out = [];

  out.push(`<svg class="kc-chart kc-narrow" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="sf-title sf-desc">`);
  out.push(`<title id="sf-title">配列ごとの同指連続打鍵率</title>`);
  out.push(`<desc id="sf-desc">${esc(series.map((s) => { const p = parts(s); return `${s.name} ${pct(p.total)}%（同指異キー ${pct(p.other)}%、同指同キー ${pct(p.same)}%）`; }).join("、"))}</desc>`);
  out.push(hatchDefs("sf"));

  for (let v = 0; v <= max + 1e-9; v += 0.01) {
    const yy = y(v).toFixed(1);
    out.push(`<line x1="${L}" x2="${R}" y1="${yy}" y2="${yy}" stroke="${v === 0 ? "var(--fg)" : "var(--line)"}" stroke-width="1"/>`);
    out.push(`<text x="${L - 8}" y="${yy}" dy="0.35em" text-anchor="end" class="kc-tick">${Math.round(v * 100)}%</text>`);
  }
  out.push(`<text x="${L - 36}" y="${T - 12}" class="kc-tick">同指連続打鍵率</text>`);
  // 凡例（濃い・淡いの見本）
  const lx = 404;
  out.push(`<rect x="${lx}" y="${T - 23}" width="14" height="14" rx="2" fill="#8c8c8c"/><text x="${lx + 20}" y="${T - 12}" class="kc-tick">同指異キー</text>`);
  out.push(`<rect x="${lx + 108}" y="${T - 23}" width="14" height="14" rx="2" fill="#c9c9c9"/><text x="${lx + 128}" y="${T - 12}" class="kc-tick">同指同キー</text>`);

  series.forEach((s, i) => {
    const st = STYLE[s.name] ?? { fill: "#8c8c8c", light: "#c9c9c9" };
    const p = parts(s);
    const cx = L + band * (i + 0.5), x = cx - bw / 2;
    const mid = y(p.other), top = y(p.total);
    const edge = st.exp ? ' stroke="#d7263d" stroke-width="1.5"' : "";
    out.push(`<g class="kc-bar"><title>${esc(s.name)}: 同指連続打鍵率 ${pct(p.total)}%（同指異キー ${pct(p.other)}%、同指同キー ${pct(p.same)}%）</title>`);
    out.push(`<rect x="${(cx - band / 2 + 2).toFixed(1)}" y="${T}" width="${(band - 4).toFixed(1)}" height="${B - T}" fill="transparent"/>`);
    out.push(`<rect x="${x}" y="${mid.toFixed(1)}" width="${bw}" height="${(B - mid).toFixed(1)}" fill="${fillOf(st, "sf")}"${edge}/>`);
    out.push(`<path d="${bar(x, top, bw, mid - gap - top)}" fill="${fillOf(st, "sf", true)}"${edge}/>`);
    // 内訳の値（棒の中）と合計（棒の上）
    out.push(`<text x="${cx}" y="${((mid + B) / 2).toFixed(1)}" dy="0.35em" text-anchor="middle" class="kc-seg">${pct(p.other)}</text>`);
    out.push(`<text x="${cx}" y="${((top + mid - gap) / 2).toFixed(1)}" dy="0.35em" text-anchor="middle" class="kc-seg">${pct(p.same)}</text>`);
    out.push(`<text x="${cx}" y="${(top - 8).toFixed(1)}" text-anchor="middle" class="kc-value${st.strong ? " kc-strong" : ""}">${pct(p.total)}%</text>`);
    out.push(...nameLabel(s.name, cx, B + 20, st));
    out.push(`</g>`);
  });

  out.push(`</svg>`);
  return out.join("\n");
}

// コーパス別の同指連続打鍵率（%）。合計の下に内訳の行を足す
export function renderSameFingerTable(result) {
  const names = sfOrder(result.total);
  const cells = (series, f) => sorted(series, names).map((s) => `<td>${f(s)}</td>`).join("");
  const row = (label, c) => `<tr><th>${label}</th><td>${fmt(c.used)}</td>${cells(c.series, (s) => pct(parts(s).total))}</tr>`;
  return [
    `<div class="table-wrap">`,
    `<table class="kc-table">`,
    `<thead><tr><th>コーパス（%）</th><th>文</th>${names.map((n) => headCell(n)).join("")}</tr></thead>`,
    `<tbody>`,
    ...result.corpora.map((c) => row(`<a href="${c.source}">${esc(c.name)}</a>`, c)),
    row("合計", result.total),
    `<tr><th>うち同指異キー</th><td></td>${cells(result.total.series, (s) => pct(parts(s).other))}</tr>`,
    `<tr><th>うち同指同キー</th><td></td>${cells(result.total.series, (s) => pct(parts(s).same))}</tr>`,
    `</tbody>`,
    `</table>`,
    `</div>`,
  ].join("\n");
}

export function renderSameFingerSection(result) {
  return [
    `<figure class="kc-figure">`,
    renderSameFingerSvg(result.total),
    `</figure>`,
    `<details class="kc-details">`,
    `<summary>コーパス別の同指連続打鍵率</summary>`,
    renderSameFingerTable(result),
    `    <p class="note">コーパスは比較1と同じ。指はタッチタイピングの一般的な割り当てとし、DvorakJP 系は Dvorak 配列、<a href="https://o24.works/layout/">大西配列</a>は大西配列、そのほかは QWERTY 配列のキーボードで打つものとして数えた。大西配列のローマ字テーブルは通常ローマ字（QWERTY と同じ）。計測スクリプト： <a href="https://github.com/cafe6a6e/DvorakJP-lite/blob/main/tools/keystrokes.js">tools/keystrokes.js</a>（指の割り当ては <a href="https://github.com/cafe6a6e/DvorakJP-lite/blob/main/tools/fingers.js">tools/fingers.js</a>）</p>`,
    `</details>`,
  ].join("\n");
}

// README の同指連続打鍵率の表（合計、高い順）
export function renderSameFingerReadme(result) {
  const t = result.total;
  const rows = sorted(t.series, sfOrder(t)).map((s) => {
    const p = parts(s);
    return `| ${s.name}${STYLE[s.name]?.exp ? "（Experimental）" : ""} | ${pct(p.total)}% | ${pct(p.other)}% | ${pct(p.same)}% |`;
  });
  return [
    "| 配列 | 同指連続打鍵率 | うち同指異キー | うち同指同キー |",
    "|---|--:|--:|--:|",
    ...rows,
  ].join("\n");
}

if (import.meta.main) {
  await writeChart(await Bun.file(root + "docs/data/keystrokes.json").json());
  console.log("書き出し: docs/index.html のグラフ、README.md の表（打鍵効率、同指連続打鍵率）");
}

// 打鍵効率のグラフ（インライン SVG）と数値の表を作り、docs/index.html と README.md の印の間に書き込む
//   bun tools/keystroke-chart.js   docs/data/keystrokes.json から作り直す
// tools/keystrokes.js の計測の最後にも呼ばれる。
const root = new URL("../", import.meta.url).pathname;
const PAGE = root + "docs/index.html";
const README = root + "README.md";
const START = "<!-- keystroke-chart:start（tools/keystroke-chart.js が生成） -->";
const END = "<!-- keystroke-chart:end -->";

// 系列ごとの見た目。lite を強調色に、比較対象は灰色にする
const STYLE = {
  "QWERTY": { fill: "#c9c9c9" },
  "AZIK": { fill: "#ababab" },
  "DvorakJP": { fill: "#8c8c8c" },
  "DvorakJP lite": { fill: "#d7263d", strong: true },
  "DvorakJP lite ＋ 短縮拡張": { fill: "url(#kc-hatch)", exp: true },
};

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

// 合計の打鍵効率が低い順の系列名（グラフと表の並び）
const order = (total) => [...total.series].sort((a, b) => a.efficiency - b.efficiency).map((s) => s.name);
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
  out.push(`<desc id="kc-desc">${esc(total.series.map((s) => `${s.name} ${f3(s.efficiency)}`).join("、"))}</desc>`);
  out.push(`<defs><pattern id="kc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f6c3ca"/><line x1="0" y1="0" x2="0" y2="6" stroke="#d7263d" stroke-width="2.5"/></pattern></defs>`);

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
    out.push(`<g class="kc-bar"><title>${esc(s.name)}: 打鍵効率 ${s.efficiency.toFixed(4)}（${fmt(s.strokes)} 打）</title>`);
    out.push(`<rect x="${(cx - band / 2 + 2).toFixed(1)}" y="${T}" width="${(band - 4).toFixed(1)}" height="${B - T}" fill="transparent"/>`);
    out.push(`<path d="${bar(cx - bw / 2, top, bw, B - top)}" fill="${st.fill}"${st.exp ? ' stroke="#d7263d" stroke-width="1.5"' : ""}/>`);
    out.push(`<text x="${cx}" y="${top - 8}" text-anchor="middle" class="kc-value${st.strong ? " kc-strong" : ""}">${f3(s.efficiency)}</text>`);
    // 名前（2 行目は「+ 短縮拡張」とフラスコ）
    const [l1, l2] = s.name.split(" ＋ ");
    out.push(`<text x="${cx}" y="${B + 20}" text-anchor="middle" class="kc-label${st.strong ? " kc-strong" : ""}">${esc(l1)}</text>`);
    if (l2) {
      out.push(`<text x="${cx - 8}" y="${B + 38}" text-anchor="middle" class="kc-label">＋ ${esc(l2)}</text>`);
      out.push(`<svg x="${cx + 32}" y="${B + 26}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d7263d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>Experimental（実験中）</title>${FLASK_PATHS}</svg>`);
    }
    out.push(`</g>`);
  });

  out.push(`</svg>`);
  return out.join("\n");
}

export function renderTable(result) {
  const names = order(result.total);
  // 「DvorakJP lite ＋ 短縮拡張」は「＋」の前で改行して、列を狭くする
  const head = names.map((n) => `<th>${n.split(" ＋ ").map(esc).join("<br>＋ ")}${STYLE[n]?.exp ? ` ${FLASK_ICON}` : ""}</th>`).join("");
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
  return `    <p class="note">日本語の文章（${list}）で計測。英字・数字を含む文は除く。AZIK のローマ字テーブルは <a href="https://note.com/actbemu/n/n74f1c04c9a2e">AZIK総合解説書</a>の仕様による。計測スクリプト： <a href="https://github.com/cafe6a6e/DvorakJP-lite/blob/main/tools/keystrokes.js">tools/keystrokes.js</a></p>`;
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

// 印の間（今の内容）
export function currentSection(text) {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < 0) throw new Error("グラフの印がない");
  return text.slice(a + START.length, b).trim();
}

// README の打鍵効率の表（合計、低い順）
export function renderReadme(result) {
  const t = result.total;
  const rows = sorted(t.series, order(t)).map((s) =>
    `| ${s.name}${STYLE[s.name]?.exp ? "（Experimental）" : ""} | ${f3(s.efficiency)} |`);
  return [
    "| ローマ字テーブル | 打鍵効率 |",
    "|---|--:|",
    ...rows,
  ].join("\n");
}

async function replaceSection(path, body, indent = "") {
  const text = await Bun.file(path).text();
  currentSection(text);
  const a = text.indexOf(START), b = text.indexOf(END);
  await Bun.write(path, text.slice(0, a + START.length) + "\n" + body + "\n" + indent + text.slice(b));
}

export async function writeChart(result) {
  await replaceSection(PAGE, renderSection(result), "    ");
  await replaceSection(README, renderReadme(result));
}

if (import.meta.main) {
  await writeChart(await Bun.file(root + "docs/data/keystrokes.json").json());
  console.log("書き出し: docs/index.html のグラフ、README.md の表");
}

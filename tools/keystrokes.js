// 公開コーパスで、ローマ字変換表ごとの最短打鍵数を比べる
//   bun tools/keystrokes.js                      既定の4系列で計測する
//   bun tools/keystrokes.js 名前=表のパス[:noext] ...   系列を指定する（:noext は拡張キーを使わない）
//   bun tools/keystrokes.js --diff=DvorakJP,DvorakJP lite   2つの系列で打鍵数が違う文を書き出す
// 打ち方は練習ページと同じ docs/romaji.js の plan() で求める。
//   bun tools/keystrokes.js --corpus=JSUT,ITA   計測するコーパスを絞る
// コーパス（JSUT、ITA、Tatoeba、livedoor ニュース、京大 Wikipedia 注釈コーパス）は初回に .cache/corpus/ へダウンロードし、
// 表記どおりの読み（助詞の「は」もそのまま）に変換する。Wikipedia は付属の読みを、ほかは kuromoji を使う。
// 結果は docs/data/keystrokes.json と docs/data/keystrokes.csv に書く。
import { parseTable, plan } from "../docs/romaji.js";
import { writeChart } from "./keystroke-chart.js";

const root = new URL("../", import.meta.url).pathname;

// 打鍵数が違う文を数える2つの系列（JSON の diff）
const COMPARE = ["DvorakJP", "DvorakJP lite"];

export const DEFAULT_SERIES = [
  "QWERTY=test/fixtures/qwerty-base.txt",
  // AZIK（QWERTY 用）。typepedia.jp の src/romantables/azik.txt（AZIK総合解説書の仕様から作成、Unlicense）をコピーしたもの
  "AZIK=test/fixtures/azik.txt",
  "DvorakJP=test/fixtures/dvorakjp-original.txt",
  "DvorakJP lite=docs/romantable_dvorakjplite.txt",
  "DvorakJP lite ＋ 短縮拡張=docs/romantable_dvorakjplite_abbr.txt",
];

// コーパス。load は { text, kana, typed } の配列を返す（読めない語があれば kana は null）
export const CORPORA = {
  JSUT: {
    source: "https://github.com/sarulab-speech/jsut-label",
    license: "CC BY-SA 4.0",
    load: async ({ text, kuromoji }) =>
      kuromoji([...(await text("https://raw.githubusercontent.com/sarulab-speech/jsut-label/master/text_kana/basic5000.yaml"))
        .matchAll(/^  text_level0: (.+)$/gm)].map((m) => m[1])),
  },
  ITA: {
    source: "https://github.com/mmorise/ita-corpus",
    license: "CC0",
    // 「EMOTION100_001:えっ嘘でしょ。,エッウソデショ。」の、: と , の間
    load: async ({ text, kuromoji }) => {
      const files = await Promise.all(["emotion", "recitation"].map(
        (f) => text(`https://raw.githubusercontent.com/mmorise/ita-corpus/main/${f}_transcript_utf8.txt`)));
      return kuromoji(files.join("\n").split("\n").filter((l) => l.includes(":"))
        .map((l) => l.slice(l.indexOf(":") + 1).split(",")[0]));
    },
  },
  // 日常の短文・会話。「id<TAB>jpn<TAB>文」の形
  Tatoeba: {
    source: "https://tatoeba.org/ja/downloads",
    license: "CC BY 2.0 FR",
    load: async ({ file, kuromoji }) => {
      const path = await file("https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2");
      const tsv = Bun.spawnSync(["bunzip2", "-c", path]).stdout.toString();
      return kuromoji(tsv.split("\n").filter(Boolean).map((l) => l.split("\t")[2]));
    },
  },
  // ニュース記事（9 カテゴリ）。各記事は「URL、日付、見出し、本文…」の行。本文を「。」と改行で文に分ける
  livedoor: {
    source: "https://www.rondhuit.com/download.html#ldcc",
    license: "CC BY-ND 2.1 JP",
    load: async ({ archive, kuromoji }) => {
      const dir = await archive("https://www.rondhuit.com/download/ldcc-20140209.tar.gz", "ldcc");
      const sentences = [];
      const paths = [...new Bun.Glob("text/*/*-*.txt").scanSync(dir)].sort();
      for (const p of paths) {
        const body = (await Bun.file(`${dir}/${p}`).text()).split("\n").slice(3);
        for (const line of body) sentences.push(...line.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean));
      }
      return kuromoji(sentences);
    },
  },
  // Wikipedia の文。人手で確かめた形態素ごとの読みが付いている（KNP 形式）ので、kuromoji は使わない
  Wikipedia: {
    source: "https://github.com/ku-nlp/WikipediaAnnotatedCorpus",
    license: "CC BY-SA 4.0",
    load: async ({ archive }) => {
      const dir = await archive("https://codeload.github.com/ku-nlp/WikipediaAnnotatedCorpus/tar.gz/refs/heads/main", "wac");
      const items = [];
      const paths = [...new Bun.Glob("*/knp/*/*.knp").scanSync(dir)].sort();
      for (const p of paths) items.push(...parseKnp(await Bun.file(`${dir}/${p}`).text()));
      return items;
    },
  },
};

// 「名前=パス[:noext]」を読む
export function parseSeries(spec) {
  const eq = spec.indexOf("=");
  if (eq < 1) throw new Error(`系列の指定は 名前=表のパス[:noext]: ${spec}`);
  let path = spec.slice(eq + 1);
  const ext = !path.endsWith(":noext");
  if (!ext) path = path.slice(0, -":noext".length);
  return { name: spec.slice(0, eq), path, ext };
}

// 系列を読み込む。読み（ひらがな）と比べるので、変換表の出力のカタカナ（AZIK の「ヴ」など）はひらがなにそろえる
export async function loadSeries(spec) {
  const s = parseSeries(spec);
  return { ...s, table: parseTable(toHira(await Bun.file(root + s.path).text())) };
}

// かな列を打つ最短の打鍵数。打てなければ null
export function countStrokes(t, kana, allowExt) {
  const segs = plan(t, kana, allowExt);
  return segs ? segs.reduce((n, s) => n + s.key.length, 0) : null;
}

// 文ごとに全系列で数える。items は { kana, typed }（typed は変換後の日本語のうち打つ部分）。
// どれかの表で打てない文は全系列から除く。
// efficiency（打鍵効率）は 変換後の日本語の文字数 ÷ 打鍵数。cmp に2つの系列名を渡すと、打鍵数が違う文の数も数える
export function measure(series, items, cmp) {
  const strokes = series.map(() => 0);
  let used = 0, untypable = 0, kana = 0, chars = 0;
  const [ia, ib] = (cmp ?? []).map((n) => series.findIndex((s) => s.name === n));
  const diff = cmp && ia >= 0 && ib >= 0 ? { a: cmp[0], b: cmp[1], fewer: 0, fewerStrokes: 0, more: 0, moreStrokes: 0 } : null;
  for (const x of items) {
    const r = series.map((s) => countStrokes(s.table, x.kana, s.ext));
    if (r.includes(null)) { untypable++; continue; }
    used++;
    kana += x.kana.length;
    chars += [...x.typed].length;
    r.forEach((n, i) => { strokes[i] += n; });
    if (diff) {
      const d = r[ib] - r[ia];
      if (d < 0) { diff.fewer++; diff.fewerStrokes -= d; }
      if (d > 0) { diff.more++; diff.moreStrokes += d; }
    }
  }
  const base = strokes[0];
  return {
    used, untypable, kana, chars,
    series: series.map((s, i) => ({
      name: s.name, table: s.path, ext: s.ext, strokes: strokes[i],
      efficiency: round(chars / strokes[i], 4), perKana: round(strokes[i] / kana, 4), ratio: round(strokes[i] / base, 4),
    })),
    ...(diff ? { diff } : {}),
  };
}

// 2つの系列 a, b で打鍵数が違う文。items は { text, kana }。打鍵数の差（b − a）が大きい順
export function diffSentences(a, b, items) {
  const keys = (s, kana) => plan(s.table, kana, s.ext)?.map((x) => x.key);
  const out = [];
  for (const { text, kana } of items) {
    const ka = keys(a, kana), kb = keys(b, kana);
    if (!ka || !kb) continue;
    const d = kb.join("").length - ka.join("").length;
    if (d !== 0) out.push({ d, text, kana, [a.name]: ka.join(" "), [b.name]: kb.join(" ") });
  }
  return out.sort((x, y) => x.d - y.d);
}

// 全コーパスの合計
export function total(corpora) {
  const sum = (f) => corpora.reduce((n, c) => n + f(c), 0);
  const chars = sum((c) => c.chars);
  const series = corpora[0].series.map((s, i) => {
    const strokes = sum((c) => c.series[i].strokes);
    return { name: s.name, strokes, efficiency: round(chars / strokes, 4) };
  });
  const out = { used: sum((c) => c.used), chars, series };
  if (corpora.every((c) => c.diff)) {
    out.diff = { ...corpora[0].diff };
    for (const k of ["fewer", "fewerStrokes", "more", "moreStrokes"]) out.diff[k] = sum((c) => c.diff[k]);
  }
  return out;
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// カタカナ → ひらがな
const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 変換表で打つ文字（かな・長音・句読点・かぎかっこ）だけか
const TYPED = /^[ぁ-ゖァ-ヺー、。「」]+$/;

// 語ごとの読みをつなげる。それ以外の記号（？ ！ ・ … など）は、どの配列でも同じキーを打つので数えない。
// 戻り値: { kana: 読み, typed: 数えた語の表記（変換後の日本語）}。読みのない語（英字・数字など）があれば null
export function joinReadings(words) {
  let kana = "", typed = "";
  for (const { surface, reading, symbol } of words) {
    if (reading && TYPED.test(reading)) kana += reading;
    else if (TYPED.test(surface)) kana += surface;
    else if (symbol) continue;
    else return null;
    typed += surface;
  }
  return { kana: toHira(kana), typed };
}

// 文と、語ごとの読みから { text, kana, typed } を作る（読めなければ kana と typed は null）
const sentence = (text, words) => ({ text, kana: null, typed: null, ...joinReadings(words) });

// KNP 形式（京大コーパス）→ [{ text, kana, typed }]。形態素の行は「表層 読み 原形 品詞 …」
export function parseKnp(src) {
  const items = [];
  let words = [];
  for (const line of src.split("\n")) {
    if (line.startsWith("# S-ID")) words = [];
    else if (line === "EOS") {
      items.push(sentence(words.map((w) => w.surface).join(""), words));
    } else if (line && !/^[#*+]/.test(line)) {
      const [surface, reading, , pos] = line.split(" ");
      words.push({ surface, reading, symbol: pos === "特殊" });
    }
  }
  return items;
}

// ダウンロード先（.cache/corpus/）。取得済みなら使い回す
const cacheDir = `${root}.cache/corpus`;

async function download(url, name = url.split("/").at(-1)) {
  const path = `${cacheDir}/${name}`;
  if (await Bun.file(path).exists()) return path;
  console.error(`ダウンロード: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  await Bun.write(path, res);
  return path;
}

// tar.gz を .cache/corpus/<name>/ に展開して、そのディレクトリを返す
async function extract(url, name) {
  const dir = `${cacheDir}/${name}`;
  if (await Bun.file(`${dir}/.done`).exists()) return dir;
  const path = await download(url, `${name}.tar.gz`);
  Bun.spawnSync(["mkdir", "-p", dir]);
  const r = Bun.spawnSync(["tar", "xzf", path, "-C", dir]);
  if (r.exitCode !== 0) throw new Error(`展開できない: ${path}\n${r.stderr}`);
  await Bun.write(`${dir}/.done`, "");
  return dir;
}

async function buildTokenizer() {
  const { default: kuromoji } = await import("kuromoji");
  const dicPath = new URL("../node_modules/kuromoji/dict/", import.meta.url).pathname;
  return new Promise((ok, ng) => kuromoji.builder({ dicPath }).build((e, t) => (e ? ng(e) : ok(t))));
}

// 文 → { text, kana, typed }（kuromoji の読み）
function reading(tokenizer, text) {
  return sentence(text, tokenizer.tokenize(text).map((tok) => ({
    surface: tok.surface_form,
    reading: tok.reading !== "*" ? tok.reading : null,
    symbol: tok.pos === "記号",
  })));
}

// CORPORA の load に渡す道具（ダウンロード、展開、kuromoji での読み）
export function corpusContext() {
  let tokenizer;
  return {
    text: async (url) => Bun.file(await download(url)).text(),
    file: download,
    archive: extract,
    kuromoji: async (sentences) => {
      tokenizer ??= await buildTokenizer();
      return sentences.map((text) => reading(tokenizer, text));
    },
  };
}

// 端末での表示幅（全角は2）
const width = (s) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0xff ? 2 : 1), 0);

function toCsv(result) {
  const rows = [["corpus", "series", "table", "ext", "strokes", "chars", "kana", "efficiency", "per_kana", "ratio_vs_qwerty"]];
  for (const c of result.corpora) {
    for (const s of c.series) rows.push([c.name, s.name, s.table, s.ext, s.strokes, c.chars, c.kana, s.efficiency, s.perKana, s.ratio]);
  }
  return rows.map((r) => r.map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const diffArg = args.find((x) => x.startsWith("--diff="));
  const specs = args.filter((x) => !x.startsWith("--"));
  const series = await Promise.all((specs.length ? specs : DEFAULT_SERIES).map(loadSeries));
  const diffPair = diffArg?.slice("--diff=".length).split(",").map((n) => {
    const s = series.find((x) => x.name === n);
    if (!s) throw new Error(`--diff の系列が見つからない: ${n}`);
    return s;
  });
  const only = args.find((x) => x.startsWith("--corpus="))?.slice("--corpus=".length).split(",");
  const ctx = corpusContext();

  const corpora = [];
  for (const [name, c] of Object.entries(CORPORA)) {
    if (only && !only.includes(name)) continue;
    const all = await c.load(ctx);
    const items = all.filter((x) => x.kana);
    const r = measure(series, items, COMPARE);
    const noReading = all.length - items.length;
    corpora.push({ name, source: c.source, license: c.license, sentences: all.length, noReading, ...r });

    console.log(`\n### ${name}: ${all.length} 文（計測 ${r.used}、読めない語あり ${noReading}、打てない文字あり ${r.untypable}）、かな ${r.kana} 字`);
    const w = Math.max(...series.map((s) => width(s.name))) + 2;
    for (const s of r.series) {
      console.log(`${s.name + " ".repeat(w - width(s.name))} ${String(s.strokes).padStart(8)} 打  打鍵効率 ${s.efficiency.toFixed(4)}  ${s.perKana.toFixed(3)} 打/かな  ${series[0].name}比 ${(s.ratio * 100).toFixed(1)}%`);
    }
    if (r.diff) console.log(`${r.diff.b} と ${r.diff.a} で打鍵数が違う文: ${r.diff.b} が少ない ${r.diff.fewer} 文（${r.diff.fewerStrokes} 打）、多い ${r.diff.more} 文（${r.diff.moreStrokes} 打）`);
    if (diffPair) {
      const diffs = diffSentences(...diffPair, items);
      const less = diffs.filter((x) => x.d < 0), more = diffs.filter((x) => x.d > 0);
      const file = `.cache/corpus/diff_${name}.json`;
      await Bun.write(root + file, JSON.stringify(diffs, null, 1) + "\n");
      console.log(`${diffPair[1].name} − ${diffPair[0].name}: 少ない文 ${less.length}（計 ${less.reduce((n, x) => n + x.d, 0)} 打）、多い文 ${more.length}（計 +${more.reduce((n, x) => n + x.d, 0)} 打） → ${file}`);
    }
  }

  const result = { generated: new Date().toISOString().slice(0, 10), corpora, total: total(corpora) };
  await Bun.write(root + "docs/data/keystrokes.json", JSON.stringify(result, null, 2) + "\n");
  await Bun.write(root + "docs/data/keystrokes.csv", toCsv(result));
  await writeChart(result);
  console.log("\n書き出し: docs/data/keystrokes.json, docs/data/keystrokes.csv、docs/index.html のグラフ");
}

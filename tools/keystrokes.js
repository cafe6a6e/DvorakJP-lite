// 公開コーパスで、ローマ字変換表ごとの打鍵効率と同指連続打鍵率を比べる
//   bun tools/keystrokes.js                      既定の系列（DEFAULT_SERIES）で計測する
//   bun tools/keystrokes.js 名前=表のパス[:noext][@キーボード] ...   系列を指定する
//     :noext は拡張キーを使わない。@qwerty（既定）・@dvorak・@onishi は、同じ指かを判定するキーボード配列
//   bun tools/keystrokes.js --diff=DvorakJP,DvorakJP lite   2つの系列で打鍵数が違う文を書き出す
//   bun tools/keystrokes.js --corpus=JSUT,ITA   計測するコーパスを絞る
// 打ち方は練習ページと同じ docs/romaji.js の plan() で求める。
// コーパス（JSUT、ITA、Tatoeba、livedoor ニュース、京大 Wikipedia 注釈コーパス）は初回に .cache/corpus/ へダウンロードし、
// 表記どおりの読み（助詞の「は」もそのまま）に変換する。Wikipedia は付属の読みを、ほかは kuromoji を使う。
// 同指連続打鍵率（直前と同じ指で打つ打鍵数 ÷ 打鍵数）の打ち方は、最短の打ち方のうち同じ指の連続が最も少ないもの。
// 結果は docs/data/keystrokes.json と docs/data/keystrokes.csv に書く。
// 再現できるように、GitHub のコーパスはコミットを固定して取得し、使ったファイルの SHA-256 を JSON の files に記録する
// （Tatoeba は毎週更新される最新版しか配布されていないので、SHA-256 で同じデータかを確かめる）。
import { parseTable, plan } from "../docs/romaji.js";
import { countSameFinger, KEYBOARDS, sameFinger } from "./fingers.js";
import { writeChart } from "./keystroke-chart.js";

const root = new URL("../", import.meta.url).pathname;

// 打鍵数が違う文を数える2つの系列（JSON の diff）
const COMPARE = ["DvorakJP", "DvorakJP lite"];

export const DEFAULT_SERIES = [
  "QWERTY=test/fixtures/qwerty-base.txt",
  // 大西配列（https://o24.works/layout/）。ローマ字の規則は変えない入れ替え配列なので、ローマ字テーブルは QWERTY と同じ
  "大西配列=test/fixtures/qwerty-base.txt@onishi",
  // AZIK（QWERTY 用）。typepedia.jp の src/romantables/azik.txt（AZIK総合解説書の仕様から作成、Unlicense）をコピーしたもの
  "AZIK=test/fixtures/azik.txt",
  "DvorakJP=test/fixtures/dvorakjp-original.txt@dvorak",
  "DvorakJP lite=docs/romantable_dvorakjplite.txt@dvorak",
  "DvorakJP lite ＋ 短縮拡張=docs/romantable_dvorakjplite_abbr.txt@dvorak",
];

// コーパス。load は { text, kana, typed } の配列を返す（読めない語があれば kana は null）
export const CORPORA = {
  JSUT: {
    source: "https://github.com/sarulab-speech/jsut-label",
    license: "CC BY-SA 4.0",
    load: async ({ text, kuromoji }) =>
      kuromoji([...(await text("https://raw.githubusercontent.com/sarulab-speech/jsut-label/1978271ca6212e1ea742da8f149160f5679e8971/text_kana/basic5000.yaml"))
        .matchAll(/^  text_level0: (.+)$/gm)].map((m) => m[1])),
  },
  ITA: {
    source: "https://github.com/mmorise/ita-corpus",
    license: "CC0",
    // 「EMOTION100_001:えっ嘘でしょ。,エッウソデショ。」の、: と , の間
    load: async ({ text, kuromoji }) => {
      const files = await Promise.all(["emotion", "recitation"].map(
        (f) => text(`https://raw.githubusercontent.com/mmorise/ita-corpus/994844bcac6925c900fd4ab45beab11b0b9ea7bd/${f}_transcript_utf8.txt`)));
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
      const dir = await archive("https://codeload.github.com/ku-nlp/WikipediaAnnotatedCorpus/tar.gz/3e1d28b2120fed7e8f6c30b9ad6e18906fc3a1e7", "wac");
      const items = [];
      const paths = [...new Bun.Glob("*/knp/*/*.knp").scanSync(dir)].sort();
      for (const p of paths) items.push(...parseKnp(await Bun.file(`${dir}/${p}`).text()));
      return items;
    },
  },
};

// 「名前=パス[:noext][@キーボード]」を読む
export function parseSeries(spec) {
  const eq = spec.indexOf("=");
  if (eq < 1) throw new Error(`系列の指定は 名前=表のパス[:noext][@キーボード]: ${spec}`);
  let path = spec.slice(eq + 1);
  let keyboard = "qwerty";
  const at = path.lastIndexOf("@");
  if (at >= 0) {
    keyboard = path.slice(at + 1);
    path = path.slice(0, at);
    if (!KEYBOARDS[keyboard]) throw new Error(`キーボードは ${Object.keys(KEYBOARDS).join("・")} のどれか: ${spec}`);
  }
  const ext = !path.endsWith(":noext");
  if (!ext) path = path.slice(0, -":noext".length);
  return { name: spec.slice(0, eq), path, ext, keyboard };
}

// 系列を読み込む。読み（ひらがな）と比べるので、変換表の出力のカタカナ（AZIK の「ヴ」など）はひらがなにそろえる
export async function loadSeries(spec) {
  const s = parseSeries(spec);
  return { ...s, table: parseTable(toHira(await Bun.file(root + s.path).text())) };
}

// かな列を、最短の打鍵数で、そのうち同じ指の連続が最も少なく打つ。打てなければ null
// 戻り値: { strokes, sameFinger, sameKey }（sameFinger は同じ指が続く回数で、同じキーの連打 sameKey を含む）
export function analyze(s, kana) {
  const sf = (a, b) => (sameFinger(s.keyboard, a, b) ? 1 : 0);
  // 打鍵数を優先し、同じ打鍵数なら同じ指の連続が少ない打ち方を選ぶ。
  // 同じ指の連続は打鍵数より少ないので、1 打を STROKE にすれば、打鍵数が 1 打でも少ない打ち方が必ず選ばれる
  const STROKE = 1e6;
  const cost = (key, ext, first) => {
    let n = first === null ? 0 : sf(key.at(-1), first);
    for (let i = 1; i < key.length; i++) n += sf(key[i - 1], key[i]);
    return key.length * STROKE + n;
  };
  const segs = plan(s.table, kana, s.ext, cost);
  if (!segs) return null;
  const keys = segs.map((x) => x.key).join("");
  return { strokes: keys.length, ...countSameFinger(s.keyboard, keys) };
}

// 文ごとに全系列で数える。items は { kana, typed }（typed は変換後の日本語のうち打つ部分）。
// どれかの表で打てない文は全系列から除く。
// efficiency（打鍵効率）は 変換後の日本語の文字数 ÷ 打鍵数。cmp に2つの系列名を渡すと、打鍵数が違う文の数も数える
// sameFingerRate（同指連続打鍵率）は 同じ指が続く回数 ÷ 打鍵数。
// 前の系列と同じ変換表（キーボードだけが違う）の系列には sameTableAs を付ける（打鍵数と打鍵効率は同じになる）
export function measure(series, items, cmp) {
  const strokes = series.map(() => 0);
  const same = series.map(() => 0), sameKey = series.map(() => 0);
  let used = 0, untypable = 0, kana = 0, chars = 0;
  const [ia, ib] = (cmp ?? []).map((n) => series.findIndex((s) => s.name === n));
  const diff = cmp && ia >= 0 && ib >= 0 ? { a: cmp[0], b: cmp[1], fewer: 0, fewerStrokes: 0, more: 0, moreStrokes: 0 } : null;
  for (const x of items) {
    const a = series.map((s) => analyze(s, x.kana));
    if (a.includes(null)) { untypable++; continue; }
    const r = a.map((v) => v.strokes);
    used++;
    kana += x.kana.length;
    chars += [...x.typed].length;
    a.forEach((v, i) => { strokes[i] += v.strokes; same[i] += v.sameFinger; sameKey[i] += v.sameKey; });
    if (diff) {
      const d = r[ib] - r[ia];
      if (d < 0) { diff.fewer++; diff.fewerStrokes -= d; }
      if (d > 0) { diff.more++; diff.moreStrokes += d; }
    }
  }
  const base = strokes[0];
  return {
    used, untypable, kana, chars,
    series: series.map((s, i) => {
      const dup = series.find((o) => o.path === s.path && o.ext === s.ext);
      return {
        name: s.name, table: s.path, ext: s.ext, keyboard: s.keyboard, strokes: strokes[i],
        efficiency: round(chars / strokes[i], 4), perKana: round(strokes[i] / kana, 4), ratio: round(strokes[i] / base, 4),
        sameFinger: same[i], sameKey: sameKey[i], sameFingerRate: round(same[i] / strokes[i], 4),
        ...(dup !== s ? { sameTableAs: dup.name } : {}),
      };
    }),
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
    const sameFinger = sum((c) => c.series[i].sameFinger), sameKey = sum((c) => c.series[i].sameKey);
    return {
      name: s.name, strokes, efficiency: round(chars / strokes, 4),
      sameFinger, sameKey, sameFingerRate: round(sameFinger / strokes, 4),
      ...(s.sameTableAs ? { sameTableAs: s.sameTableAs } : {}),
    };
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

// 使ったファイルの URL と SHA-256（コーパスごとに JSON の files に書く）
const usedFiles = [];

// 取得済みのファイルは使い回す。URL（固定したコミット）が変わったら取り直す。取得元の URL は <ファイル>.url に書いておく
// 戻り値: { path, sha256 }
async function fetchCached(url, name) {
  const path = `${cacheDir}/${name}`;
  const urlFile = Bun.file(`${path}.url`);
  if (!(await Bun.file(path).exists()) || !(await urlFile.exists()) || (await urlFile.text()) !== url) {
    console.error(`ダウンロード: ${url}`);
    // 通信が止まったまま待ち続けないように、5 分で打ち切る
    const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    // Response をそのまま Bun.write に渡すと、止まったまま終わらないことがあったので、読み終えてから書く
    await Bun.write(path, await res.arrayBuffer());
    await Bun.write(urlFile, url);
  }
  const sha256 = new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
  usedFiles.push({ url, sha256 });
  return { path, sha256 };
}

const download = async (url, name = url.split("/").at(-1)) => (await fetchCached(url, name)).path;

// tar.gz を .cache/corpus/<name>/ に展開して、そのディレクトリを返す
// 展開済みの印 .done には、展開した tar.gz の SHA-256 を書く
async function extract(url, name) {
  const dir = `${cacheDir}/${name}`;
  const { path, sha256 } = await fetchCached(url, `${name}.tar.gz`);
  const done = Bun.file(`${dir}/.done`);
  if ((await done.exists()) && (await done.text()) === sha256) return dir;
  Bun.spawnSync(["rm", "-rf", dir]);
  Bun.spawnSync(["mkdir", "-p", dir]);
  const r = Bun.spawnSync(["tar", "xzf", path, "-C", dir]);
  if (r.exitCode !== 0) throw new Error(`展開できない: ${path}\n${r.stderr}`);
  await Bun.write(`${dir}/.done`, sha256);
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
  const rows = [["corpus", "series", "table", "ext", "keyboard", "strokes", "chars", "kana", "efficiency", "per_kana", "ratio_vs_qwerty", "same_finger", "same_key", "same_finger_rate"]];
  for (const c of result.corpora) {
    for (const s of c.series) rows.push([c.name, s.name, s.table, s.ext, s.keyboard, s.strokes, c.chars, c.kana, s.efficiency, s.perKana, s.ratio, s.sameFinger, s.sameKey, s.sameFingerRate]);
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
    usedFiles.length = 0;
    const all = await c.load(ctx);
    const files = [...usedFiles];
    const items = all.filter((x) => x.kana);
    const r = measure(series, items, COMPARE);
    const noReading = all.length - items.length;
    corpora.push({ name, source: c.source, license: c.license, files, sentences: all.length, noReading, ...r });

    console.log(`\n### ${name}: ${all.length} 文（計測 ${r.used}、読めない語あり ${noReading}、打てない文字あり ${r.untypable}）、かな ${r.kana} 字`);
    const w = Math.max(...series.map((s) => width(s.name))) + 2;
    for (const s of r.series) {
      console.log(`${s.name + " ".repeat(w - width(s.name))} ${String(s.strokes).padStart(8)} 打  打鍵効率 ${s.efficiency.toFixed(4)}  ${s.perKana.toFixed(3)} 打/かな  ${series[0].name}比 ${(s.ratio * 100).toFixed(1)}%  同指 ${(s.sameFingerRate * 100).toFixed(2)}%（うち連打 ${(s.sameKey / s.strokes * 100).toFixed(2)}%）`);
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
  console.log("\n書き出し: docs/data/keystrokes.json、docs/data/keystrokes.csv、docs/index.html のグラフ、README.md の表");
}

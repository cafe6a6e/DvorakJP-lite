// README とサイトに書かれた打ち方の例が、変換表のとおりに変換されるか
// （「DvorakJP とは」ページは、元祖 DvorakJP の変換表で確かめる）
import { describe, expect, test } from "bun:test";
import { flush } from "../docs/romaji.js";
import { ORIGINAL_PATH, loadTableFile, readText } from "./helpers.js";

const t = await loadTableFile();
const original = await loadTableFile(ORIGINAL_PATH);
const root = new URL("../", import.meta.url);

// 「`s'` `s-` さい」「`ky,` きょう、」「`vj`→ねん」のような「キー → かな」の組を抜き出す
// 「`cna` も `cya` も」の「も」、「`h`・`n`」の「・」も、かなではないので除く
const PARTICLES = new Set(["または", "など", "か", "は", "に", "で", "や", "と", "を", "が", "の", "も", "・"]);
// かなの直後が「、」「（」「）」「|」「です」「など」、次のキー、行末のときだけ例とみなす（「`ph` でも打てます」などを除く）
const PAIR = /((?:`[^`\s]+`\s*(?:\/\s*)?)+)(?:→\s*)?([ぁ-ゖー〜‥…『』←→↑↓・][ぁ-ゖー。〜‥…『』←→↑↓・]*)(?=[、（）)]|\s*(?:\||`|です|など|$))/gmu;

// Google 日本語入力の標準の記号入力として紹介しているだけの組（lite でも元祖でも、この意味では使わない）
const NOT_EXAMPLES = new Set(["z.\t…"]);

function extractPairs(text) {
  const pairs = [];
  for (const m of text.matchAll(PAIR)) {
    let kana = m[2];
    if (PARTICLES.has(kana)) continue;
    for (const [, key] of m[1].matchAll(/`([^`]+)`/g)) {
      // 文末の「。」は、キー自体が . で終わるとき（un. → うん。）だけ出力の一部
      const out = key.endsWith(".") ? kana : kana.replace(/。$/, "");
      if (NOT_EXAMPLES.has(`${key}\t${out}`)) continue;
      pairs.push([key, out]);
    }
  }
  return pairs;
}

// README: 「## 拡張仕様」の節（な行の表も含む。元祖 DvorakJP の打ち方を紹介する「設計思想」の節は対象外）
const readme = await readText(new URL("README.md", root).pathname);
const specStart = readme.indexOf("## 拡張仕様");
const spec = readme.slice(specStart, readme.indexOf("\n## ", specStart + 1));

// サイトのページ本文（<main> の中）。<code> をバッククォートにしてからタグを外す
async function pageText(path) {
  const html = await readText(new URL(path, root).pathname);
  return html
    .slice(html.indexOf("<main>"), html.indexOf("</main>"))
    .replace(/<code>(.*?)<\/code>/g, "`$1`")
    .replace(/<\/t[dh]>/g, " | ") // 表のセルの区切り（隣のセルのキーとつながらないように）
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const about = await pageText("docs/index.html");
const dvorakjp = await pageText("docs/dvorakjp/index.html");

const sources = [
  ["README の拡張仕様", extractPairs(spec), t],
  ["サイトの「DvorakJP lite とは」", extractPairs(about), [t, original]],
  ["サイトの「DvorakJP とは」（元祖の変換表）", extractPairs(dvorakjp), original],
];

// 「DvorakJP lite とは」は元祖 DvorakJP の打ち方（`nj` ねん など）とも比べるので、どちらかの表どおりならよい
describe.each(sources)("%s", (_name, pairs, tables) => {
  const list = Array.isArray(tables) ? tables : [tables];
  test("例を抜き出せている", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(9);
  });

  test.each(pairs)("%p → %p", (key, kana) => {
    expect(list.map((table) => flush(table, key))).toContain(kana);
  });
});

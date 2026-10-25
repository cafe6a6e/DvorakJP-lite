// README とサイトに書かれた打ち方の例が、変換表のとおりに変換されるか
// （「DvorakJP とは」ページは、元祖 DvorakJP の変換表で確かめる）
import { describe, expect, test } from "bun:test";
import { flush } from "../docs/romaji.js";
import { loadTableFile, readText } from "./helpers.js";

const t = await loadTableFile();
const original = await loadTableFile(new URL("../google-japanese-input/romantable_dvorakjplite.default.txt", import.meta.url).pathname);
const root = new URL("../", import.meta.url);

// 「`s'` `s-` さい」「`ky,` きょう、」「`vj`→ねん」のような「キー → かな」の組を抜き出す
const PARTICLES = new Set(["または", "など", "か", "は", "に", "で", "や", "と", "を", "が", "の"]);
// かなの直後が「、」「（」「）」「|」「です」「など」、次のキー、行末のときだけ例とみなす（「`ph` でも打てます」などを除く）
const PAIR = /((?:`[^`\s]+`\s*(?:\/\s*)?)+)(?:→\s*)?([ぁ-ゖー〜‥…『』←→↑↓・][ぁ-ゖー。〜‥…『』←→↑↓・]*)(?=[、（）)]|\s*(?:\||`|です|など|$))/gmu;

function extractPairs(text) {
  const pairs = [];
  for (const m of text.matchAll(PAIR)) {
    let kana = m[2];
    if (PARTICLES.has(kana)) continue;
    for (const [, key] of m[1].matchAll(/`([^`]+)`/g)) {
      // 文末の「。」は、キー自体が . で終わるとき（un. → うん。）だけ出力の一部
      const out = key.endsWith(".") ? kana : kana.replace(/。$/, "");
      pairs.push([key, out]);
    }
  }
  return pairs;
}

// README: 「## 拡張仕様」の節（元祖 DvorakJP の打ち方を紹介する「設計思想」の節は対象外）
const readme = await readText(new URL("README.md", root).pathname);
const specStart = readme.indexOf("## 拡張仕様");
const spec = readme.slice(specStart, readme.indexOf("\n## ", specStart + 1));

// README の な行 の表は、キーの行とかなの行が分かれている
function nagyouTable(md) {
  const lines = md.split("\n");
  const i = lines.findIndex((l) => l.startsWith("| `v'`"));
  if (i < 0) return [];
  const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());
  const keys = cells(lines[i]);
  const kana = cells(lines[i + 2]);
  return keys.flatMap((k, j) => [...k.matchAll(/`([^`]+)`/g)].map(([, key]) => [key, kana[j]]));
}

// サイトのページ本文。<code> をバッククォートにしてからタグを外す
const html = await readText(new URL("docs/index.html", root).pathname);
function pageText(id, endMarker) {
  const start = html.indexOf(`id="page-${id}"`);
  return html
    .slice(start, html.indexOf(endMarker, start))
    .replace(/<code>(.*?)<\/code>/g, "`$1`")
    .replace(/<\/t[dh]>/g, " | ") // 表のセルの区切り（隣のセルのキーとつながらないように）
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const about = pageText("about", 'id="page-install"');
const dvorakjp = pageText("dvorakjp", "</section>");

const sources = [
  ["README の拡張仕様", extractPairs(spec), t],
  ["README の な行 の表", nagyouTable(readme), t],
  ["サイトの「DvorakJP lite とは」", extractPairs(about), t],
  ["サイトの「DvorakJP とは」（元祖の変換表）", extractPairs(dvorakjp), original],
];

describe.each(sources)("%s", (_name, pairs, table) => {
  test("例を抜き出せている", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(9);
  });

  test.each(pairs)("%p → %p", (key, kana) => {
    expect(flush(table, key)).toBe(kana);
  });
});

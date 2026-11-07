// 公式ページ（docs/ の 4 つの HTML）とサイトマップの検査
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readText } from "./helpers.js";

const docs = new URL("../docs/", import.meta.url).pathname;
const BASE = "https://cafe6a6e.github.io/DvorakJP-lite/";
const PAGES = ["", "install/", "playground/", "dvorakjp/"]; // サイトの URL（BASE からの相対）
const pages = await Promise.all(PAGES.map(async (path) => ({ path, html: await readText(join(docs, path, "index.html")) })));

const between = (html, a, b) => html.slice(html.indexOf(a), html.indexOf(b) + b.length);
// ページの深さによる相対パス（../）と、今いるページの印を除いて比べる
const normalize = (part, path) => part.replaceAll(path ? "../" : "", "").replace(' aria-current="page"', "").replaceAll('href="./"', 'href=""');

describe("4 つのページ", () => {
  test("ヘッダー（ナビゲーション）とフッターが同じ", () => {
    const [top, ...rest] = pages;
    for (const tag of [["<header", "</header>"], ["<footer", "</footer>"]]) {
      const ref = normalize(between(top.html, ...tag), top.path);
      for (const p of rest) expect(normalize(between(p.html, ...tag), p.path)).toBe(ref);
    }
  });

  test.each(pages.map((p) => [p.path || "（トップ）", p]))("%s: 今いるページだけに aria-current が付いている", (_, p) => {
    const nav = between(p.html, "<nav", "</nav>");
    expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
    const href = nav.match(/<a href="([^"]*)" aria-current="page">/)[1];
    expect(href.replace(/^(\.\.\/)?/, "").replace(/^\.\/$/, "")).toBe(p.path);
  });

  test("タイトル・説明文・正規 URL があり、ページごとに違う", () => {
    const get = (html, re) => html.match(re)?.[1];
    const titles = pages.map((p) => get(p.html, /<title>([^<]+)<\/title>/));
    const descs = pages.map((p) => get(p.html, /<meta name="description" content="([^"]+)">/));
    const canon = pages.map((p) => get(p.html, /<link rel="canonical" href="([^"]+)">/));
    for (const v of [...titles, ...descs]) expect(v?.length).toBeGreaterThan(10);
    expect(new Set(titles).size).toBe(PAGES.length);
    expect(new Set(descs).size).toBe(PAGES.length);
    expect(canon).toEqual(PAGES.map((path) => BASE + path));
  });

  test.each(pages.map((p) => [p.path || "（トップ）", p]))("%s: 相対パスのリンク・画像・スクリプトが実在するファイルを指す", (_, p) => {
    const dir = join(docs, p.path);
    const missing = [];
    for (const [, url] of p.html.matchAll(/(?:href|src)="([^"#:]+)(?:#[^"]*)?"/g)) {
      const target = join(dir, url);
      if (!existsSync(url.endsWith("/") ? join(target, "index.html") : target)) missing.push(url);
    }
    expect(missing).toEqual([]);
  });
});

test("サイトマップの URL が 4 つのページと一致する", async () => {
  const xml = await readText(join(docs, "sitemap.xml"));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual(PAGES.map((path) => BASE + path));
});

// 公式ページ（docs/ の 4 つの HTML）とサイトマップの検査
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readText } from "./helpers.js";
import { EDITIONS, VERSION } from "../docs/keymap.js";

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

describe("共有用の表示（OGP）とアイコン", () => {
  const get = (html, re) => html.match(re)?.[1];
  test.each(pages.map((p) => [p.path || "（トップ）", p]))("%s: OGP がタイトル・説明文・正規 URL と一致する", (_, p) => {
    const og = (name) => get(p.html, new RegExp(`<meta property="og:${name}" content="([^"]+)">`));
    expect(og("title")).toBe(get(p.html, /<title>([^<]+)<\/title>/));
    expect(og("description")).toBe(get(p.html, /<meta name="description" content="([^"]+)">/));
    expect(og("url")).toBe(BASE + p.path);
    expect(og("image")).toBe(BASE + "images/og.png");
    expect(og("site_name")).toBe("DvorakJP lite");
    expect(get(p.html, /<meta name="twitter:card" content="([^"]+)">/)).toBe("summary_large_image");
  });

  test.each(pages.map((p) => [p.path || "（トップ）", p]))("%s: ファビコンとホーム画面用のアイコンを指定している", (_, p) => {
    expect(p.html).toMatch(/<link rel="icon" href="(\.\.\/)?favicon\.svg" type="image\/svg\+xml">/);
    expect(p.html).toMatch(/<link rel="apple-touch-icon" href="(\.\.\/)?images\/apple-touch-icon\.png">/);
  });

  test("共有用の画像は 1200×630 の PNG", async () => {
    const png = new Uint8Array(await Bun.file(join(docs, "images/og.png")).arrayBuffer());
    const view = new DataView(png.buffer);
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
  });
});

test("サイトマップの URL が 4 つのページと一致する", async () => {
  const xml = await readText(join(docs, "sitemap.xml"));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual(PAGES.map((path) => BASE + path));
});

describe("短縮拡張の有無の選択（導入方法・練習）", () => {
  const withChoice = pages.filter((p) => p.path === "install/" || p.path === "playground/");

  test.each(withChoice.map((p) => [p.path, p]))("%s: 版ごとにボタンがある", (_, p) => {
    const buttons = [...p.html.matchAll(/data-edition="([^"]+)">/g)].map((m) => m[1]);
    for (const id of Object.keys(EDITIONS)) expect(buttons).toContain(id);
  });

  test("導入方法に書いてあるバージョンが VERSION と同じ（上げたら HTML も直す）", () => {
    const html = pages.find((p) => p.path === "install/").html;
    const versions = [...html.matchAll(/\bv(\d+(?:\.\d+)+)/g)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([VERSION]));
  });

  test.each(withChoice.map((p) => [p.path, p]))("%s: 「有」のボタンにフラスコのアイコン（Experimental）が付いている", (_, p) => {
    const abbr = p.html.match(/data-edition="abbr">(.*?)<\/button>/s)[1];
    expect(abbr).toContain('class="exp-icon"');
    expect(abbr).toContain('aria-label="Experimental"');
  });
});

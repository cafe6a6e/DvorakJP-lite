// サイトマップ（docs/sitemap.xml）を作り直し、各ページの更新日（<lastmod>）を入れる。
// 更新日は、そのページの HTML をコミットした最後の日。まだコミットしていない変更があれば今日にする
// （ページを直したら、`bun run build` で作り直してから、HTML と一緒にコミットする）。
// 構造化データに dateModified があるページ（「DvorakJP の解説」の Article）は、それも同じ日に合わせる。
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const docs = join(root, "docs");
export const BASE = "https://cafe6a6e.github.io/DvorakJP-lite/";
export const PAGES = ["", "install/", "playground/", "dvorakjp/"];

const git = (...args) => Bun.spawnSync(["git", ...args], { cwd: root }).stdout.toString().trim();
const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD（ローカル時刻）

export function lastModified(file) {
  const changed = git("status", "--porcelain", "--", file) !== "";
  return changed ? today() : git("log", "-1", "--format=%cs", "--", file) || today();
}

if (import.meta.main) {
  const urls = [];
  for (const path of PAGES) {
    const file = join(docs, path, "index.html");
    const html = await Bun.file(file).text();
    // dateModified を直すとファイルが変わるので、更新日は直す前の状態で決める
    const date = lastModified(file);
    const updated = html.replace(/("dateModified": ")\d{4}-\d{2}-\d{2}(")/, `$1${date}$2`);
    if (updated !== html) await Bun.write(file, updated);
    urls.push(`  <url><loc>${BASE}${path}</loc><lastmod>${date}</lastmod></url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  await Bun.write(join(docs, "sitemap.xml"), xml);
  console.log(`docs/sitemap.xml: ${PAGES.length} ページ`);
}

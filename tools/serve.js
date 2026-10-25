// 手元確認用のサーバー: docs/ をそのまま配信する（GitHub Pages と同じ構成）
//   bun run serve   → http://127.0.0.1:8000/
const root = new URL("../docs/", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 8000);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path.endsWith("/")) path += "index.html";
    // docs/ の外は読ませない
    if (path.split("/").includes("..")) return new Response("Bad Request", { status: 400 });
    const file = Bun.file(root + path.slice(1));
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
});

console.log(`docs/ を配信しています: http://${server.hostname}:${server.port}/`);

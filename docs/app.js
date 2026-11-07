// トップページ: 以前の 1 ページ構成の URL（#install など）から、分けたページへ転送する
const MOVED = { install: "install/", playground: "playground/", dvorakjp: "dvorakjp/" };
const to = MOVED[location.hash.slice(1)];
if (to) location.replace(to);

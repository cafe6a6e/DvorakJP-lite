// Google Analytics にイベントを送る（gtag が無い環境では何もしない）
// gtag は各ページの <head> で定義している。計測を止めているときは gtag.js が送信しない
export function track(name, params) {
  if (typeof gtag === "function") gtag("event", name, params);
}

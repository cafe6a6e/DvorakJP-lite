// ボタンで選ぶ設定（キーボード配列・版）。導入方法と練習のページで共有し、選んだものはブラウザに覚えておく
//   storageKey: ブラウザに覚えておくときの名前
//   values: 選べる値をキーに持つオブジェクト
//   fallback: 覚えていないときの値
//   attr: ボタンの data-* 属性の名前（例: "layout" なら data-layout）
//   selector: ボタンの CSS セレクタ
export function createChoice({ storageKey, values, fallback, attr, selector }) {
  // ブラウザの保存が使えなくても動くようにする
  function load() {
    try {
      const v = localStorage.getItem(storageKey);
      if (v in values) return v;
    } catch {}
    return fallback;
  }

  function save(v) {
    try {
      localStorage.setItem(storageKey, v);
    } catch {}
  }

  let current = load();
  const listeners = [];

  function updateButtons() {
    for (const b of document.querySelectorAll(selector)) {
      b.setAttribute("aria-pressed", String(b.dataset[attr] === current));
    }
  }

  for (const b of document.querySelectorAll(selector)) {
    b.addEventListener("click", () => {
      const v = b.dataset[attr];
      if (!(v in values) || v === current) return;
      current = v;
      save(current);
      updateButtons();
      for (const callback of listeners) callback(current);
    });
  }
  updateButtons();

  return {
    current: () => current,
    // 選択が変わったら callback(value) を呼ぶ
    onChange: (callback) => listeners.push(callback),
  };
}

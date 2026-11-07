# 配列図の作り方

| 元の HTML | 作る画像 |
|---|---|
| `layout.html` | `docs/images/layout.webp`（DvorakJP lite） |
| `layout-dvorakjp.html` | `docs/images/layout-dvorakjp.webp`（DvorakJP） |
| `layout-dvorak.html` | `docs/images/layout-dvorak.webp`（Dvorak 配列。解説ページの「Dvorak 配列について」） |
| `og.html` | `docs/images/og.png`（SNS で共有されたときの画像。1200×630） |
| `apple-touch-icon.html` | `docs/images/apple-touch-icon.png`（iPhone などのホーム画面用のアイコン。180×180） |

HTML を編集したら、リポジトリのルートで次を実行して webp を作り直します（macOS、Google Chrome と `cwebp` が必要）。`NAME` は作り直す図の名前です。

```sh
NAME=layout   # または layout-dvorakjp、layout-dvorak
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,455 \
  --screenshot=/tmp/$NAME.png "file://$PWD/src/images/$NAME.html"
cwebp -quiet -q 90 /tmp/$NAME.png -o docs/images/$NAME.webp
```

`cwebp` は `brew install webp` で入ります。

共有用の画像とアイコンは PNG のまま使い、等倍で撮ります（ファビコン `docs/favicon.svg` は SVG を直接編集します）。

```sh
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 \
  --screenshot=docs/images/og.png "file://$PWD/src/images/og.html"
"$C" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=180,180 \
  --screenshot=docs/images/apple-touch-icon.png "file://$PWD/src/images/apple-touch-icon.html"
```

`og.html` は配列図（`docs/images/layout.webp`）を読み込むので、配列図を作り直したら `og.png` も作り直します。

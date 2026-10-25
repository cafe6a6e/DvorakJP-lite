# 配列図の作り方

| 元の HTML | 作る画像 |
|---|---|
| `layout.html` | `docs/images/layout.webp`（DvorakJP lite） |
| `layout-dvorakjp.html` | `docs/images/layout-dvorakjp.webp`（元祖 DvorakJP） |

HTML を編集したら、リポジトリのルートで次を実行して webp を作り直します（macOS、Google Chrome と `cwebp` が必要）。`NAME` は作り直す図の名前です。

```sh
NAME=layout   # または layout-dvorakjp
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,455 \
  --screenshot=/tmp/$NAME.png "file://$PWD/src/images/$NAME.html"
cwebp -quiet -q 90 /tmp/$NAME.png -o docs/images/$NAME.webp
```

`cwebp` は `brew install webp` で入ります。

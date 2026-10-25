# 配列図の作り方

`layout.html` を編集したら、リポジトリのルートで次を実行して `docs/images/layout.webp` を作り直します（macOS、Google Chrome と `cwebp` が必要）。

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,455 \
  --screenshot=/tmp/layout.png "file://$PWD/src/images/layout.html"
cwebp -quiet -q 90 /tmp/layout.png -o docs/images/layout.webp
```

`cwebp` は `brew install webp` で入ります。

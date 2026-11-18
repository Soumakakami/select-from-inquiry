# select-from-inquiry

ゲームタイトル：**ログは嘘をつかない**

ゲーム会社のサーバーエンジニアになって、ユーザーからの問い合わせ（「キャラが消えた！」「課金が反映されない！」など）を、SQL でログテーブルを調べて事実確認し、回答するブラウザゲームです。
SQLite（[sql.js](https://github.com/sql-js/sql.js)）がブラウザ内で動くので、サーバーは不要です。

**▶ 遊ぶ：https://soumakakami.github.io/select-from-inquiry/**

## フォルダ構成

| パス | 内容 |
|---|---|
| `src/` | ソース（`index.html` テンプレート、`style.css`、`game.js`、`datagen.js`、`audio.js`、`fx.js`） |
| `docs/` | **ビルド済みの公開ファイル**。GitHub Pages はここを配信する（手で編集しない） |
| `documents/` | 設計・仕様・運用のドキュメント（下記） |
| `build.js` | `src/` を1枚の `index.html` にまとめ、sql.js を `docs/` にコピーする |
| `test/` | 模範SQLの検証（Node）、通しプレイ確認（Playwright） |

> `docs/` は GitHub Pages の仕様上この名前でないと配信できないため、ドキュメントは `documents/` に置いています。

## ドキュメント

- [documents/game-design.md](documents/game-design.md) … ゲーム仕様（遊び方、採点、演出、画面構成）
- [documents/cases.md](documents/cases.md) … 問い合わせ7件の内容・正解・罠と、ケースの追加手順 **※ネタバレあり**
- [documents/database.md](documents/database.md) … テーブル定義とダミーデータの作り方
- [documents/architecture.md](documents/architecture.md) … 技術構成、ビルド、テスト
- [documents/publishing.md](documents/publishing.md) … 公開方針（GitHub Pages）と公開手順、公開前の注意点

## 開発

```sh
npm install
npm run build     # src/ から docs/ を作り直す
npx serve docs    # ブラウザで確認（index.html を直接開くと WASM を読めない）
npm run verify    # 各ケースの模範SQLを Node で実行して結果を表示
```

`src/` を変更したら、必ず `npm run build` して `docs/` も一緒にコミットしてください。

## 使用ライブラリ

- [sql.js](https://github.com/sql-js/sql.js) 1.10.3（MIT License）… `docs/` に同梱
- フォント：Google Fonts（DotGothic16、Press Start 2P）。どちらも SIL Open Font License

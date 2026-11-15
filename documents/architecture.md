# 技術構成

## 全体

- 静的ファイルだけで動く。サーバーもDBも不要。
- SQL は [sql.js](https://github.com/sql-js/sql.js) 1.10.3（SQLite を WebAssembly にしたもの）でブラウザ内で実行する。
- フレームワークなし。素の HTML / CSS / JavaScript。

## ファイル

| ファイル | 役割 |
|---|---|
| `src/index.html` | テンプレート。`/*__CSS__*/`、`/*__DATAGEN__*/`、`/*__GAME__*/` の位置に中身が埋め込まれる |
| `src/style.css` | 見た目。冒頭の `:root` に色とフォントのトークン |
| `src/datagen.js` | ダミーDBの生成（[database.md](database.md)）。ブラウザでは `window.LogDB`、Node では `module.exports` |
| `src/game.js` | ゲーム本体。資料（テーブル定義）、ケース定義、SQL実行、採点、画面描画、保存 |
| `build.js` | `src/` を1枚の `docs/index.html` にまとめ、`node_modules/sql.js/dist` から3ファイルを `docs/` にコピー |
| `docs/` | 公開物：`index.html`、`sql-wasm.js`、`sql-wasm.wasm`、`sql-asm.js`、`.nojekyll` |

## sql.js の読み込み

1. `sql-wasm.js` を `<script>` で読み、`sql-wasm.wasm` を同じフォルダから読み込む（通常はこちら）。
2. WebAssembly がCSPなどで使えない環境では、`sql-asm.js`（asm.js 版）を読み込み直して動かす。WASM の初期化は20秒でタイムアウトし、フォールバックに切り替える。
   - Claude のアーティファクトとして公開した際、表示環境のCSPで WASM が使えない可能性があったため用意した。WASM を禁止するCSPを付けたテストで、フォールバックが約1秒で起動することを確認済み。
3. `index.html` を直接開く（`file://`）と WASM を読めないので、必ずHTTP経由で開く。

## SQL の実行

- `;` で文を分割（文字列とコメント内の `;` は無視）。範囲選択があればその部分だけ実行。
- 先頭キーワードで許可を判定：SELECT / WITH / EXPLAIN / VALUES / `PRAGMA table_info` 系のみ。`query_only`、`writable_schema` を含む文も拒否。それ以外は始末書。
- 念のためDB側も `PRAGMA query_only = 1`。書き込みエラーが返った場合も始末書。
- 各文は `prepare` → `step` で実行し、列名は0件でも表示する。表示は1,000行まで、件数は全件数える。
- エラー時は、よくあるMySQLとの違いを見てヒントを出す（`INTERVAL`、`DATE_ADD`、`DATE_FORMAT`、`no such column` など）。

## 状態と保存

- `state`：現在のケース、ケースごとの状態（open / solved / gaveup）、誤答数、ヒント数、点数、クエリ数、選択中の結論と根拠、エディタの下書き、実行履歴（最大40件）、始末書の枚数。
- `localStorage` のキー `logs-dont-lie:v1` に保存。使えない環境でも動く（try/catch）。
- Claude のアーティファクトで表示したときに状態を引き継ぐため、`window.claude.hot` があれば snapshot / ready を使う。GitHub Pages では無関係で、無視される。

## テスト

| コマンド | 内容 |
|---|---|
| `npm run verify` | Node で DB を作り、各ケースの模範SQLとデータの整合性（残高がマイナスにならない、同じワールドで生きているキャラの名前が重複しない、など）を出力する |
| `python3 test/play.py` | Playwright（Chromium）で `docs/` を配信し、誤答、始末書、重いクエリ、全7件の正解、結果画面までを通しでプレイ。`test/shots/` にスクリーンショットを保存 |
| `python3 test/csp.py` | WASM を禁止するCSPを付けて開き、asm.js へのフォールバックを確認 |

Python のテストには `pip install playwright` と `playwright install chromium` が必要。

## 既知の制約

- 正解の判定はクライアント側にあるため、ソースを読めば答えが分かる。ランキングを付けるなら判定をサーバー側に移す必要がある（[publishing.md](publishing.md)）。
- フォントは Google Fonts から読み込む。オフラインでは代替フォントになる。

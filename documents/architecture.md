# 技術構成

## 全体

- 静的ファイルだけで動く。サーバーもDBも不要。
- SQL は [sql.js](https://github.com/sql-js/sql.js) 1.10.3（SQLite を WebAssembly にしたもの）でブラウザ内で実行する。
- フレームワークなし。素の HTML / CSS / JavaScript。

## ファイル

| ファイル | 役割 |
|---|---|
| `src/index.html` | テンプレート。`/*__CSS__*/`、`/*__DATAGEN__*/`、`/*__CASEGEN__*/`、`/*__SHOP__*/`、`/*__AUDIO__*/`、`/*__FX__*/`、`/*__GAME__*/` の位置に中身が埋め込まれる |
| `src/style.css` | 見た目（ドット絵のUI）。冒頭の `:root` に色、フォント、ドットの角丸（`--notch`）のトークン |
| `src/datagen.js` | ダミーDBの生成（[database.md](database.md)）。ブラウザでは `window.LogDB`、Node では `module.exports` |
| `src/casegen.js` | 問い合わせ票93件の自動生成（`window.CaseGen.build(DB)`）と、研修の3件（`CaseGen.training(DB, 除外する公開ID)`）。Node では `module.exports`。DBの実データから、正解・根拠・解説・模範SQLまで組み立てる（[cases.md](cases.md)） |
| `src/shop.js` | 購買部の品ぞろえ（`window.Shop`）。品物の名前・値段・入荷日・説明・使う場所（`where`）と、12×12のドット絵。効果そのものは `game.js` が実装する |
| `src/audio.js` | BGMと効果音（`window.Sound`）。Web Audio API で合成するので音声ファイルはない |
| `src/fx.js` | 演出（`window.FX`）。ドット絵の登場人物（12×12の文字列からSVGを生成）、HUDのアイコン（8×8）、ハンマー・丸めた紙・ゴミ箱のスプライト、タイトル背景の街（`skyline()`）、証拠カード（`evidence()`）、禁断のDROP（`dropSequence()`）、始末書のゴミ箱ミニゲーム（`trashThrow()`）、BANハンマー（`banHammer()`）、会話ウィンドウ、カットイン、フラッシュ、サイレン、紙吹雪、得点のポップアップとカウントアップ、起動ログ。画像ファイルはない |
| `src/game.js` | ゲーム本体。資料（テーブル定義）、ケース定義、研修のレクチャー（`LESSONS`）、SQL実行、採点、画面描画、保存 |
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

## サウンド

- 音声ファイルは使わず、`src/audio.js` が Web Audio API（オシレーターとノイズ）でその場で合成する。ダウンロードもライセンスも不要で、CSPにも引っかからない。
- ブラウザの自動再生制限のため、最初のクリック／キー入力で `AudioContext` を作る。それまでは何も鳴らない。
- BGM：78BPM のローファイ。コード進行 Fmaj7 → G6 → Em7 → Am9 にパッド、ベース、エレピ風の8小節メロディ、控えめなドラム。先読みスケジューラ（25msごとに0.15秒先まで予約）で鳴らす。「出社する」を押すと始まり、タブが隠れている間は止まる。
- 曲は `SONGS` に並ぶ：`lofi`（標準）、購買部のカセットで買える `chip`（132BPM、矩形波のメロディ）、`city`（100BPM）、`rain`（64BPM、ドラムの代わりに雨音）。`Sound.setSong(名前)` で切り替える。
- 効果音：SQL実行（`run` / `ok` / `error`）、正解（`solved`）、差し戻し（`reject`）、ヒント（`hint`）、始末書（`shimatsu`）、重いクエリ（`warn`）、チケット切り替え（`page`）、チケット着信（`ring` / `print`）、会話の文字送り（`type`）、コンボ（`combo`）、カットイン（`whoosh`）、スコア加算（`tick`）、起動ログ（`boot`）、出社（`start`）、先輩に聞く（`giveup`）、結果発表（`final` / `reveal` / `rank`）、小さな通知（`pop`）、メカニカルキーボードの実行音（`runMech`）、レジ（`register`）、給料（`coins`）、缶を開ける（`can`）、時計の巻き戻し（`rewind`）。`game.js` / `fx.js` から `snd('名前')` で呼ぶ。

## 演出

- `game.js` は `window.FX` があれば演出を出し、なければ従来のトーストなどで動く（`fx.js` が読めなくてもゲームは遊べる）。
- 会話ウィンドウは右下に固定。キューに積んで順に表示し、差し戻しや始末書のような即時の反応は `interrupt` で割り込む。文字数に応じて自動で閉じ、ホバー中は閉じない。
- カットイン・フラッシュ・紙吹雪は `#fx-layer`（`pointer-events: none`）に一時的に追加して、終わったら消す。紙吹雪は Web Animations API。
- `prefers-reduced-motion: reduce` のときは揺れ・紙吹雪・文字送り・起動ログのアニメーションを省く。
- HUD右上の「BGM」「SE」でオン／オフ。設定は `localStorage` のキー `logs-dont-lie:audio` に保存。

## 状態と保存

- 起動の順番：画面を描く → DBを作る → `CaseGen.build(DB)` で93件を `CASES` に足して100件にする → `CaseGen.training()` で研修の3件をその後ろに足す（どちらも書き込み禁止にする前） → 保存データを読む（`loadState`） → 描画。DBができるまでタイトル画面のボタンは押せない。
- `CASES` の並び：`[0, WORK)` が本番の100件、`[WORK, CASES.length)` が研修の3件。日・得点・最終結果は本番の分だけで数える。研修の各ステップ（`steps`）は `game.js` の `LESSONS` にあり、SQLの実行結果・タブの切り替え・解決を `lessonEvent()` に渡して進める。
- `state`：所持金（`wallet`）、生涯年収（`earned`）、使った額（`spent`、種類別は `spentBy`）、各日の給与明細（`pay`）、消耗品の数（`inv`）、持っている道具と飾り（`owned`）、使い中の効果（`buffs`：おごり・胃薬・エナジードリンク）、カセット（`tape`）、付箋メモ（`snippets`）、購買部を最後にのぞいた日（`shopSeenDay`。HUD の NEW に使う）、研修中か本番か（`phase`）、研修を修了したか（`trainDone`）、研修を受け直す前のチケット（`workCurrent`）、今の日（`day`）と各日の退勤時刻・得点（`dayLog`）、現在のケース、100件のチケットの順番（前から5件ずつが1日分）、ケースごとの状態（open / solved / gaveup、研修はステップの進み `step` も）、誤答数、ヒント数、点数、クエリ数、選択中の結論と根拠、Kさんの調査メモを使ったか（`radar`）、エディタの下書き、始末書の枚数、コンボ、ゲーム内時計、「仕様です」を使った日（`specDay`）。
- `localStorage` のキー `logs-dont-lie:v1` に保存。使えない環境でも動く（try/catch）。
- Claude のアーティファクトで表示したときに状態を引き継ぐため、`window.claude.hot` があれば snapshot / ready を使う。GitHub Pages では無関係で、無視される。

## デバッグモード（動作確認用）

SQLエディタに `:debug` と書いて実行（Ctrl+Enter）すると、画面左下にデバッグパネルが出る。もう一度実行すると消える（`:debug on` / `:debug off` も可）。URL に `?debug` を付けて開いても入る。このコマンドはDBに流さないので、始末書も時計も動かない。オン／オフはセーブデータとは別に `localStorage` の `logs-dont-lie:debug` に残る。

| 項目 | できること |
|---|---|
| 所持金 | +1,000 / +10,000 / 0 にする |
| チケット | 強制成功（正解を入れて普通に回答したことにする。演出・点数・コンボもそのまま動く）、強制差し戻し、未解決に戻す。正解の結論と根拠の表示、正解を入力欄に入れる、模範SQLを実行 |
| 進行 | 今日の残りを全部解決、今日を締める（残りを解決して1日の結果画面へ）、DAY n へジャンプ（それより前の日は全部解決扱い。飛ばした日の給料は出ない） |
| 購買部 | 全道具を持つ、道具・飾りを手放す、消耗品を満タン、入荷通知（NEW）をリセット |
| 時計・ペナルティ | 10:00 に戻す、+2時間、18:30 にする、始末書 +1 / 0、コンボ +1 |

デバッグで変えた値はふつうのセーブデータに保存される。元に戻すときはタイトル画面の「最初からやり直す」を使う。実装は `src/game.js` の「デバッグモード」の節。

## テスト

| コマンド | 内容 |
|---|---|
| `npm run verify` | Node で DB を作り、各ケースの模範SQLとデータの整合性（残高がマイナスにならない、同じワールドで生きているキャラの名前が重複しない、など）を出力する |
| `npm run cases` | 自動生成した93件と研修の3件を検証する：研修が3件ある、選択肢に正解がある、根拠が自分の値を受け付けて他は受け付けない、模範SQLがエラーなく動いて行を返す、決め手のログがそのユーザーのもの、ユーザーとチケット番号が重複しない、受付日時が範囲内（研修のユーザーも本番の100件と重ならない） |
| `python3 test/play.py` | Playwright（Chromium）で `docs/` を配信し、研修をスキップして、誤答、始末書、重いクエリのあと、20日×5件の100件をすべて解いて、1日の結果画面と最終結果画面まで通しでプレイ。自動生成の答えは、ページの中で同じDBを作って `CaseGen.build` から引く。`test/shots/` にスクリーンショットを保存 |
| `python3 test/csp.py` | WASM を禁止するCSPを付けて開き、asm.js へのフォールバックを確認 |

Python のテストには `pip install playwright` と `playwright install chromium` が必要。

## 既知の制約

- 正解の判定はクライアント側にあるため、ソースを読めば答えが分かる。ランキングを付けるなら判定をサーバー側に移す必要がある（[publishing.md](publishing.md)）。
- フォントは Google Fonts から読み込む。オフラインでは代替フォントになる。

# データベース

ブラウザ内の SQLite（sql.js）に、起動のたびにダミーの本番DBを作る。データは `src/datagen.js` が生成する。

## 方針

- **日時はすべて日本時間（JST）**。`'YYYY-MM-DD HH:MM:SS'` の文字列。問い合わせもJSTなので、初心者でも時差を気にせずそのまま比べられる。
  - 生成処理の中は UTC で組み立て、DBに書き出すとき（`generate()` の戻り値を作るところ）で `toJ` / `fmtJ` により +9時間している。`src/datagen.js` に書かれたシナリオの時刻は UTC なので注意。
- **乱数シード固定**（mulberry32、シード 20261113）。誰がいつ遊んでも同じデータになる。
- ログ期間は 2026-10-20 09:00 〜 2026-11-13 10:00（ゲーム内の「今」）。
- `WHERE` なしでは目的のログにたどり着けないよう、ノイズを大量に混ぜる。
- 起動後に `PRAGMA query_only = 1` を設定し、書き込みはDB側でも拒否する。

## テーブルの命名規則

テーブル名の先頭で、何のデータかが分かるようにする。

| 先頭 | 種類 | テーブル |
|---|---|---|
| `usr_` | ユーザーが持つデータ（今の状態） | `usr_users`、`usr_characters` |
| `mst_` | マスター（運営が用意する定義データ） | `mst_worlds`、`mst_items`、`mst_products` |
| `log_` | ログ（起きたことの記録、追記のみ） | `log_login`、`log_character`、`log_item`、`log_currency`、`log_payment`、`log_error` |

- ログのテーブルは `log_` が付くので、末尾に `_logs` は付けない（`item_logs` ではなく `log_item`）。
- 以前の名前からの対応：`users`→`usr_users`、`characters`→`usr_characters`、`worlds`→`mst_worlds`、`m_items`→`mst_items`、`m_products`→`mst_products`、`login_logs`→`log_login`、`character_logs`→`log_character`、`item_logs`→`log_item`、`currency_logs`→`log_currency`、`payment_logs`→`log_payment`、`error_logs`→`log_error`。
- 新しいテーブルを足すときもこの規則に従う。

## 件数（現在の生成結果）

| テーブル | 行数 |
|---|---|
| usr_users | 160 |
| usr_characters | 324 |
| log_login | 2,985 |
| log_character | 360 |
| log_item | 9,884 |
| log_currency | 7,943 |
| log_payment | 107 |
| log_error | 226 |

## テーブル定義

| テーブル | 主な列 | 補足 |
|---|---|---|
| `usr_users` | user_id, public_id, platform, status, created_at | 問い合わせには public_id（例 U-38127）が書かれる。user_id は作成順の連番 |
| `usr_characters` | character_id, user_id, world_id, name, job, level, created_at, deleted_at | 論理削除。名前はワールド内で一意（削除済みは除く） |
| `mst_worlds` | world_id, name | 1 アルファ、2 ベータ、3 ガンマ |
| `log_character` | log_id, user_id, character_id, action, detail(JSON), ip_address, device_id, created_at | CREATE / DELETE / RESTORE / RENAME / WORLD_TRANSFER |
| `log_login` | log_id, user_id, result, ip_address, country, device_id, created_at | SUCCESS / FAILED |
| `log_item` | log_id, user_id, character_id, item_id, item_uid, action, quantity, target_user_id, detail(JSON), created_at | GET / USE / SELL / TRADE_OUT / TRADE_IN / ENHANCE_SUCCESS / ENHANCE_FAIL / ENHANCE_DESTROY / STORAGE_IN / STORAGE_OUT / EXPIRE。item_uid は装備の個体ID |
| `mst_items` | item_id, name, category, rarity, tradable | 31種 |
| `log_currency` | log_id, user_id, currency, amount, balance_after, reason, ref_id, created_at | GOLD / GEM。ref_id に決済の transaction_id などが入る |
| `log_payment` | payment_id, user_id, product_id, price_jpy, store, transaction_id, status, created_at | SUCCESS / CANCELED |
| `mst_products` | product_id, name, price_jpy, gem | ジェムパック6種 |
| `log_error` | log_id, level, service, message, user_id, created_at | WARN / ERROR |

インデックスは user_id と created_at の組み合わせを中心に張っている。

## 生成の流れ（`generate()`）

1. **ユーザー**：ノイズ150人＋シナリオ用の固定ユーザー。作成日時順に user_id を振る。
2. **キャラ**：シナリオ用の固定キャラ、おとりキャラ、ノイズキャラ。作成日時順に character_id を振る。
3. **ログ**：
   - 全キャラの CREATE、削除済みキャラの DELETE。ノイズの RENAME、WORLD_TRANSFER、DELETE→RESTORE。
   - ノイズユーザーの日々のプレイ（ログイン、アイテム入手・使用・売却・強化・倉庫・トレード、ゴールド・ジェムの増減、課金）。プレイ時間帯はJSTの朝・昼・夜に寄せている。
   - ノイズのエラーログ（スロークエリ、タイムアウトなど）。
   - 各ケースのシナリオログ（[cases.md](cases.md)）。
4. **仕上げ**：テーブルごとに created_at 順で並べて log_id を採番。キー付きの行は `keys` に ID を記録。`balance_after` は時系列に積み上げて計算し、マイナスにならないよう初期残高を調整する。

## ブラウザ側で足している関数

MySQL に慣れた人でも書きやすいように、`create_function` で登録している。

| 関数 | 動き |
|---|---|
| `CONVERT_TZ(dt, from, to)` | `'+00:00'`、`'+09:00'`、`'UTC'`、`'JST'`、`'Asia/Tokyo'`、`'SYSTEM'`（= JST）に対応 |
| `NOW()` | ゲーム内の現在時刻 `2026-11-13 10:00:00`（JST） |

SQLite の `date(created_at)`、`datetime(created_at, '+1 day')`、`json_extract(detail, '$.from')` もそのまま使える。

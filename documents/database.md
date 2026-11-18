# データベース

ブラウザ内の SQLite（sql.js）に、起動のたびにダミーの本番DBを作る。データは `src/datagen.js` が生成する。全27テーブル。

## 方針

- **日時はすべて日本時間（JST）**。`'YYYY-MM-DD HH:MM:SS'` の文字列。問い合わせもJSTなので、初心者でも時差を気にせずそのまま比べられる。
  - 生成処理の中は UTC で組み立て、DBに書き出すとき（`generate()` の戻り値を作るところ）で `toJ` / `fmtJ` により +9時間している。`src/datagen.js` に書かれたシナリオの時刻は UTC なので注意。マスター（イベント・ガチャの期間）だけは JST の文字列をそのまま書いている。
- **乱数シード固定**（mulberry32、シード 20261113）。誰がいつ遊んでも同じデータになる。
  - 装備・ガチャ（天井を含む）・ステージ・ランキング・プレゼント・ミッションは、あとから足したテーブル。既存のデータ（と問題の答え）を変えないよう、**別の乱数列**（シード +7）で生成している。
- ログ期間は 2026-10-20 09:00 〜 2026-11-13 10:00（ゲーム内の「今」）。
- `WHERE` なしでは目的のログにたどり着けないよう、ノイズを大量に混ぜる。
- テーブル同士の値はつじつまを合わせる（ガチャのジェム消費 ↔ ガチャの結果 ↔ 手に入れた装備、クエスト報酬 ↔ ステージのクリア、ランキング ↔ 実際のクリアや寄付、プレゼントやミッション報酬の受け取り ↔ ジェムやアイテムの増加、ミッションの進み具合 ↔ 実際のログ）。新しい問題を作るときの材料にする。
- 起動後に `PRAGMA query_only = 1` を設定し、書き込みはDB側でも拒否する。
- 画面右の「テーブル定義」は**アルファベット順**に並べる（`log_` → `mst_` → `usr_` の順になる）。

## テーブルの命名規則

テーブル名の先頭で、何のデータかが分かるようにする。

| 先頭 | 種類 | テーブル |
|---|---|---|
| `usr_` | ユーザーが持つデータ（今の状態） | `usr_characters`、`usr_equips`、`usr_gacha_ceilings`、`usr_gachas`、`usr_missions`、`usr_presents`、`usr_rankings`、`usr_users` |
| `mst_` | マスター（運営が用意する定義データ） | `mst_equips`、`mst_events`、`mst_gacha_ceilings`、`mst_gacha_lineups`、`mst_gachas`、`mst_items`、`mst_missions`、`mst_products`、`mst_stages`、`mst_worlds` |
| `log_` | ログ（起きたことの記録、追記のみ） | `log_character`、`log_currency`、`log_equip`、`log_error`、`log_gacha`、`log_item`、`log_login`、`log_payment`、`log_stage` |

- ログのテーブルは `log_` が付くので、末尾に `_logs` は付けない（`item_logs` ではなく `log_item`）。
- `usr_` と `mst_` は複数形、`log_` は単数形。
- 以前の名前からの対応：`users`→`usr_users`、`characters`→`usr_characters`、`worlds`→`mst_worlds`、`m_items`→`mst_items`、`m_products`→`mst_products`、`login_logs`→`log_login`、`character_logs`→`log_character`、`item_logs`→`log_item`、`currency_logs`→`log_currency`、`payment_logs`→`log_payment`、`error_logs`→`log_error`。
- 新しいテーブルを足すときもこの規則に従う。

## 件数（現在の生成結果）

| テーブル | 行数 | テーブル | 行数 |
|---|---|---|---|
| log_character | 360 | mst_items | 14 |
| log_currency | 8,304 | mst_missions | 12 |
| log_equip | 4,612 | mst_products | 6 |
| log_error | 226 | mst_stages | 20 |
| log_gacha | 3,458 | mst_worlds | 3 |
| log_item | 9,640 | usr_characters | 324 |
| log_login | 2,985 | usr_equips | 1,577 |
| log_payment | 107 | usr_gacha_ceilings | 376 |
| log_stage | 3,166 | usr_gachas | 376 |
| mst_equips | 17 | usr_missions | 905 |
| mst_events | 6 | usr_presents | 1,290 |
| mst_gacha_ceilings | 5 | usr_rankings | 184 |
| mst_gacha_lineups | 60 | usr_users | 160 |
| mst_gachas | 3 | | |

## テーブル定義（アルファベット順）

| テーブル | 主な列 | 補足 |
|---|---|---|
| `log_character` | log_id, user_id, character_id, action, detail(JSON), ip_address, device_id, created_at | CREATE / DELETE / RESTORE / RENAME / WORLD_TRANSFER |
| `log_currency` | log_id, user_id, currency, amount, balance_after, reason, ref_id, created_at | GOLD / GEM。reason に PRESENT（プレゼントの受け取り）と MISSION（ミッション報酬）が増えた。ref_id は `stage:〜`（クエスト報酬）、`gacha:〜`、`present:〜`、`mission:〜`、`guild:〜`、決済の transaction_id など |
| `log_equip` | log_id, user_id, character_id, equip_id, equip_uid, action, target_user_id, detail(JSON), created_at | 装備の GET / ENHANCE_SUCCESS / ENHANCE_FAIL / ENHANCE_DESTROY / STORAGE_IN / STORAGE_OUT / TRADE_OUT / TRADE_IN / SELL。以前は log_item に混ざっていた |
| `log_error` | log_id, level, service, message, user_id, created_at | WARN / ERROR |
| `log_gacha` | log_id, user_id, gacha_id, currency_log_id, reward_type, reward_id, rarity, created_at | 1回1行（10連なら10行）。currency_log_id でジェムを払った log_currency の行とつながる |
| `log_item` | log_id, user_id, character_id, item_id, action, quantity, target_user_id, detail(JSON), created_at | 消耗品・素材・チケットの GET / USE / TRADE_OUT / TRADE_IN / EXPIRE。detail の source に入手元（クエスト報酬、ガチャ、プレゼントBOX など） |
| `log_login` | log_id, user_id, result, ip_address, country, device_id, created_at | SUCCESS / FAILED |
| `log_payment` | payment_id, user_id, product_id, price_jpy, store, transaction_id, status, created_at | SUCCESS / CANCELED |
| `log_stage` | log_id, user_id, character_id, stage_id, result, score, clear_time_sec, created_at | CLEAR / FAILED。レイドの score は与ダメージ |
| `mst_equips` | equip_id, name, category, rarity, tradable, attack, defense | 武器・防具・アクセサリ17種（ID は以前の item_id のまま） |
| `mst_events` | event_id, name, event_type, world_id, start_at, end_at, description | 6件：ハロウィン、星喰いの竜 討伐戦、秋の大感謝祭、ギルド貢献ランキング、ガンマ開拓祭（world_id = 3）、11月ログインボーナス |
| `mst_gacha_ceilings` | ceiling_id, gacha_id, required_count, reward_type, reward_id | 天井（交換型）。1回まわすごとに1ポイント、required_count に届くと reward のどれか1つと交換できる（交換するとポイントがその分減る）。常設は200回で聖衣ルミナ・深淵の指輪・蒼炎の杖から選択、限定は100回でピックアップのSSR |
| `mst_gacha_lineups` | lineup_id, gacha_id, reward_type, reward_id, rarity, rate | rate は千分率でガチャごとに合計1000。SSR は3%（限定ガチャはピックアップが2%、ほかが0.5%ずつ） |
| `mst_gachas` | gacha_id, name, event_id, gem_single, gem_ten, start_at, end_at | standard（常設）、halloween、2026_autumn。1回300ジェム、10連3000ジェム（150は初回限定の半額） |
| `mst_items` | item_id, name, category, rarity, tradable | 消耗品・素材・チケット・マウント14種 |
| `mst_missions` | mission_id, name, mission_type, event_id, condition_type, condition_value, reward_type, reward_id, reward_quantity | 12件。DAILY（毎日0時リセット）3、WEEKLY（毎週月曜0時リセット）3、EVENT（大感謝祭・ギルド貢献）4、BEGINNER（11/1以降に作ったアカウント）2。条件は LOGIN / STAGE_CLEAR / RAID_CLEAR / GACHA_DRAW / ENHANCE_SUCCESS / GUILD_DONATE / CHARACTER_CREATE |
| `mst_products` | product_id, name, price_jpy, gem | ジェムパック6種 |
| `mst_stages` | stage_id, name, area, stage_type, event_id, recommended_level, stamina, boss_name, drop_item_id | 通常15（5エリア×3）、イベント2、レイド3。レイドの name は入手元の文字列（`レイド:星喰いの竜` など）と同じ |
| `mst_worlds` | world_id, name | 1 アルファ、2 ベータ、3 ガンマ |
| `usr_characters` | character_id, user_id, world_id, name, job, level, created_at, deleted_at | 論理削除。名前はワールド内で一意（削除済みは除く） |
| `usr_equips` | equip_uid, user_id, character_id, equip_id, level, in_storage, obtained_at | いま持っている装備。売却・消滅したものはない。トレードされた装備は相手の持ち物になっている |
| `usr_gacha_ceilings` | user_id, gacha_id, ceiling_count, exchanged_count, updated_at | ユーザー×ガチャの天井ポイント。天井まで回した人はまだいないので、いまはポイント = 回した回数、交換回数は 0 |
| `usr_gachas` | user_id, gacha_id, draw_count, created_at, updated_at | ユーザー×ガチャで1行。回した回数（10連は10回）、初めて・最後に回した日時。`log_gacha` から数えるので食い違わない |
| `usr_missions` | user_id, mission_id, progress, cleared_at, received_at, updated_at | ミッションの進み具合。progress は達成に必要な数で止まる。デイリー・ウィークリーは今の周期（今日・今週）の分だけを持つ（usr_ は「今の状態」）。進みのないミッションの行はない |
| `usr_presents` | present_id, user_id, present_type, reward_id, quantity, title, source, created_at, expires_at, received_at | プレゼントBOX。LOGIN_BONUS / MAINTENANCE / EVENT。received_at が NULL なら未受け取り |
| `usr_rankings` | event_id, user_id, score, rank, updated_at | ev_raid_star（与ダメージの合計）と ev_guild（寄付ゴールドの合計） |
| `usr_users` | user_id, public_id, platform, status, created_at | 問い合わせには public_id（例 U-38127）が書かれる。user_id は作成順の連番 |

インデックスは user_id と created_at の組み合わせを中心に張っている（`log_equip` は equip_uid にも）。

## 生成の流れ（`generate()`）

1. **ユーザー**：ノイズ150人＋シナリオ用の固定ユーザー。作成日時順に user_id を振る。
2. **キャラ**：シナリオ用の固定キャラ、おとりキャラ、ノイズキャラ。作成日時順に character_id を振る。
3. **ログ**：
   - 全キャラの CREATE、削除済みキャラの DELETE。ノイズの RENAME、WORLD_TRANSFER、DELETE→RESTORE。
   - ノイズユーザーの日々のプレイ（ログイン、アイテム・装備の入手・使用・売却・強化・倉庫・トレード、ゴールド・ジェムの増減、課金）。プレイ時間帯はJSTの朝・昼・夜に寄せている。
   - ノイズのエラーログ（スロークエリ、タイムアウトなど）。
   - 各ケースのシナリオログ（[cases.md](cases.md)）。
4. **追加テーブル**（別の乱数列）：
   - アイテムのログのうち、装備（mst_equips にあるID）の行を `log_equip` に移す。
   - **ガチャ**：既存の GACHA（ジェム消費）1件ごとに、引いた結果を `log_gacha` に書く。期間外のガチャIDは期間内のものに直す。出た装備は `log_equip` の GET、アイテムは `log_item` の GET（source = `ガチャ:〜`）にも書く。それを数えて `usr_gachas`（ユーザー×ガチャの回数）と `usr_gacha_ceilings`（天井ポイント）を作る。天井の交換はプレイヤーが好きなときに行うもので、まだ誰も届いていない。
   - **ステージ**：クエスト報酬（QUEST_REWARD）1件ごとに直前のクリア記録を `log_stage` に書き、ref_id を `stage:〜` にする（15%は直前に失敗も）。イベント期間は特設ステージも遊ぶ。レイドで手に入れた装備・アイテムにはレイドのクリア記録を付ける。星喰いの竜 討伐戦にはレベル60以上のキャラを持つユーザーが挑む。
   - **ランキング**：星喰いの竜は期間中のクリアの与ダメージ合計、ギルド貢献は期間中の GUILD_DONATE の合計で順位を付ける。
   - **プレゼント**：11月のログインボーナス（その日最初のログインで届く）、11/6 臨時メンテナンスのお詫び（300ジェム）、討伐戦の順位報酬。受け取りはそのユーザーのログインのついでで、ジェムは log_currency の PRESENT、アイテムは log_item の GET（source = `プレゼントBOX`）。
   - **ミッション**：ログイン（その日最初のログイン）、ステージのクリア、レイドのクリア、ガチャ、強化の成功、ギルドへの寄付、キャラクター作成を実際のログから数え、期間（今日・今週・イベント期間・アカウント作成以降）に入る分を合計して `usr_missions` を作る。必要数に届いた時刻が cleared_at。85%はその場で受け取り、ジェムは log_currency の MISSION、アイテムは log_item の GET（source = `ミッション報酬`）。
   - **今持っている装備**：期間前の手持ちに、`log_equip` を時系列で当てはめて `usr_equips` を組み立てる（強化でレベル、倉庫の出し入れ、トレードで持ち主、売却・消滅で削除）。
5. **仕上げ**：テーブルごとに created_at 順で並べて log_id を採番。キー付きの行は `keys` に ID を記録。`balance_after` は時系列に積み上げて計算し、マイナスにならないよう初期残高を調整する。

## ブラウザ側で足している関数

MySQL に慣れた人でも書きやすいように、`create_function` で登録している。

| 関数 | 動き |
|---|---|
| `CONVERT_TZ(dt, from, to)` | `'+00:00'`、`'+09:00'`、`'UTC'`、`'JST'`、`'Asia/Tokyo'`、`'SYSTEM'`（= JST）に対応 |
| `NOW()` | ゲーム内の現在時刻 `2026-11-13 10:00:00`（JST） |

SQLite の `date(created_at)`、`datetime(created_at, '+1 day')`、`json_extract(detail, '$.from')` もそのまま使える。

(function () {
  'use strict';

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORE_KEY = 'logs-dont-lie:v1';
  const NOW_JST = '2026-11-13 10:00:00';
  const BASE = 100, WRONG = 25, HINT = 10, SHIMATSU = 15, FLOOR = 20, COMBO = 10;
  // 「ゲームだからいいよね」の機能
  const SPEC_SCORE = 60, BACKDOOR_SCORE = 80, ENJO = 50, BIG_ROWS = 200000;
  // ゲーム内時計（10:00 出社からの経過分）の進み方
  const CLOCK = { query: 2, hint: 3, wrong: 8, solve: 10, giveup: 15 }, DAY_START = 10 * 60, DAY_END = 18 * 60;
  const snd = (name) => { if (window.Sound) window.Sound.sfx(name); };
  const FXo = () => window.FX || null;
  const say = (who, html, opts) => { const f = FXo(); if (f) f.say(who, html, opts); };

  // ---------------------------------------------------------------- 資料
  const NOTES = `
    <ul>
      <li>テーブル名の頭で種類が分かります。<code>usr_</code> ユーザーのデータ、<code>mst_</code> マスター、<code>log_</code> ログ。</li>
      <li>DBの日時はすべて <em>日本時間（JST）</em>。問い合わせの日時もJSTなので、そのまま比べられます。</li>
      <li>SQLite方言。日付で絞るなら <code>created_at BETWEEN '2026-11-08 00:00:00' AND '2026-11-08 23:59:59'</code> や <code>date(created_at) = '2026-11-08'</code>。<code>NOW()</code> も使えます。</li>
      <li>JSON列は <code>json_extract(detail, '$.from')</code> で取り出せます。</li>
      <li>参照専用。更新系のSQLを流すと始末書です。</li>
      <li>結果のセルをダブルクリックすると、回答の根拠欄に入ります。</li>
    </ul>`;

  const TABLE_DOCS = [
    { name: 'usr_users', desc: 'アカウント。問い合わせには公開ID（public_id）が書かれています。', cols: [
      ['user_id', '内部ID。他のテーブルはこれで参照'], ['public_id', 'ゲーム内に表示されるID（例: U-38127）'], ['platform', 'iOS / Android / PC'],
      ['status', 'ACTIVE / BANNED'], ['created_at', 'アカウント作成日時 <em>JST</em>']] },
    { name: 'usr_characters', desc: 'キャラクター。削除は論理削除。名前はワールド内で一意。', cols: [
      ['character_id', 'キャラID'], ['user_id', '持ち主 → usr_users'], ['world_id', '所属ワールド → mst_worlds'], ['name', 'キャラ名'],
      ['job', '職業'], ['level', 'レベル'], ['created_at', '作成日時 <em>JST</em>'], ['deleted_at', '削除日時 <em>JST</em>。NULLなら未削除']] },
    { name: 'mst_worlds', desc: 'ワールド（サーバー）。', cols: [['world_id', 'ワールドID'], ['name', 'ワールド名']] },
    { name: 'log_character', desc: 'キャラクターの操作ログ。', cols: [
      ['log_id', 'ログID'], ['user_id', '操作したユーザー'], ['character_id', '対象キャラ'],
      ['action', 'CREATE / DELETE / RESTORE / RENAME / WORLD_TRANSFER'], ['detail', 'JSON。変更前後の値など'],
      ['ip_address', '操作元IP'], ['device_id', '操作元の端末'], ['created_at', '発生日時 <em>JST</em>']] },
    { name: 'log_login', desc: 'ログイン試行の記録（失敗も含む）。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ログイン先アカウント'], ['result', 'SUCCESS / FAILED'], ['ip_address', '接続元IP'],
      ['country', 'IPから推定した国コード'], ['device_id', '端末ID'], ['created_at', '発生日時 <em>JST</em>']] },
    { name: 'log_item', desc: 'アイテム（消耗品・素材・チケットなど）の増減・移動。装備は log_equip。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ユーザー'], ['character_id', 'キャラ'], ['item_id', 'アイテム → mst_items'],
      ['action', 'GET / USE / TRADE_OUT / TRADE_IN / EXPIRE'],
      ['quantity', '個数'], ['target_user_id', 'トレード相手の user_id'], ['detail', 'JSON。入手元（source）など'],
      ['created_at', '発生日時 <em>JST</em>']] },
    { name: 'mst_items', desc: 'アイテムマスタ（消耗品・素材・チケット・マウント）。', cols: [
      ['item_id', 'アイテムID'], ['name', '名前'], ['category', '消耗品 / 素材 / マウント'], ['rarity', 'N / R / SR / SSR'], ['tradable', '1 = トレード可、0 = 不可']] },
    { name: 'mst_equips', desc: '装備マスタ（武器・防具・アクセサリ）。', cols: [
      ['equip_id', '装備ID'], ['name', '名前'], ['category', '武器 / 防具 / アクセサリ'], ['rarity', 'N / R / SR / SSR / UR'],
      ['tradable', '1 = トレード可、0 = 不可'], ['attack', '攻撃力'], ['defense', '防御力']] },
    { name: 'usr_equips', desc: 'いま持っている装備（1個体1行）。売却・消滅したものは消える。', cols: [
      ['equip_uid', '装備の個体ID（例: EQ-1234-5678）'], ['user_id', '持ち主 → usr_users'], ['character_id', '装備しているキャラ'],
      ['equip_id', '装備 → mst_equips'], ['level', '強化レベル（+n）'], ['in_storage', '1 = 倉庫の中'], ['obtained_at', '手に入れた日時 <em>JST</em>']] },
    { name: 'log_equip', desc: '装備の入手・強化・倉庫・トレード・売却。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ユーザー'], ['character_id', 'キャラ'], ['equip_id', '装備 → mst_equips'], ['equip_uid', '装備の個体ID'],
      ['action', 'GET / ENHANCE_SUCCESS / ENHANCE_FAIL / ENHANCE_DESTROY / STORAGE_IN / STORAGE_OUT / TRADE_OUT / TRADE_IN / SELL'],
      ['target_user_id', 'トレード相手の user_id'], ['detail', 'JSON。入手元、強化前後のレベル、保護の巻物の使用（protect）など'], ['created_at', '発生日時 <em>JST</em>']] },
    { name: 'log_currency', desc: 'ゴールド・ジェムの増減。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ユーザー'], ['currency', 'GOLD / GEM'], ['amount', '増減（マイナスは消費）'], ['balance_after', '変動後の残高'],
      ['reason', 'QUEST_REWARD / SHOP_BUY / SELL_ITEM / ENHANCE_COST / GUILD_DONATE / AUCTION_BUY / AUCTION_SELL / GACHA / PURCHASE / PRESENT / MISSION'],
      ['ref_id', '関連ID（stage:〜、gacha:〜、present:〜、mission:〜、guild:〜、決済の transaction_id など）'], ['created_at', '発生日時 <em>JST</em>']] },
    { name: 'mst_events', desc: 'イベント。', cols: [
      ['event_id', 'イベントID（例: ev_halloween）'], ['name', 'イベント名'], ['event_type', 'SEASONAL / RAID / CAMPAIGN / RANKING / WORLD / LOGIN_BONUS'],
      ['world_id', '対象ワールド（NULL = 全ワールド）'], ['start_at', '開始 <em>JST</em>'], ['end_at', '終了 <em>JST</em>'], ['description', '説明']] },
    { name: 'mst_gachas', desc: 'ガチャ。log_currency の ref_id「gacha:〜」と同じID。', cols: [
      ['gacha_id', 'ガチャID'], ['name', 'ガチャ名'], ['event_id', '関連イベント → mst_events'], ['gem_single', '1回のジェム'], ['gem_ten', '10連のジェム'],
      ['start_at', '開始 <em>JST</em>'], ['end_at', '終了 <em>JST</em>（NULL = 常設）']] },
    { name: 'mst_gacha_lineups', desc: 'ガチャの排出内容と確率。', cols: [
      ['lineup_id', 'ID'], ['gacha_id', 'ガチャ → mst_gachas'], ['reward_type', 'ITEM / EQUIP'], ['reward_id', 'item_id か equip_id'],
      ['rarity', 'N / R / SR / SSR'], ['rate', '確率（千分率。ガチャごとに合計 1000）']] },
    { name: 'usr_gachas', desc: 'ユーザーごと・ガチャごとに回した回数（1ユーザー×1ガチャで1行）。', cols: [
      ['user_id', 'ユーザー → usr_users'], ['gacha_id', 'ガチャ → mst_gachas'], ['draw_count', '回した回数の合計（10連は10回）'],
      ['created_at', '初めて回した日時 <em>JST</em>'], ['updated_at', '最後に回した日時 <em>JST</em>']] },
    { name: 'mst_gacha_ceilings', desc: 'ガチャの天井（交換型）。1回まわすごとに1ポイント。必要数に届くと、どれか1つと交換できる。', cols: [
      ['ceiling_id', 'ID'], ['gacha_id', 'ガチャ → mst_gachas'], ['required_count', '交換に必要なポイント（回数）'],
      ['reward_type', 'EQUIP'], ['reward_id', '交換できる装備 → mst_equips（同じガチャに複数行あれば選べる）']] },
    { name: 'usr_gacha_ceilings', desc: 'ユーザーごと・ガチャごとの天井ポイント。', cols: [
      ['user_id', 'ユーザー → usr_users'], ['gacha_id', 'ガチャ → mst_gachas'], ['ceiling_count', 'いまのポイント（交換すると必要数だけ減る）'],
      ['exchanged_count', '交換した回数'], ['updated_at', '最終更新 <em>JST</em>']] },
    { name: 'mst_missions', desc: 'ミッション。', cols: [
      ['mission_id', 'ミッションID'], ['name', 'ミッション名'], ['mission_type', 'DAILY（毎日0時リセット）/ WEEKLY（毎週月曜0時リセット）/ EVENT / BEGINNER'],
      ['event_id', '関連イベント → mst_events'], ['condition_type', 'LOGIN / STAGE_CLEAR / RAID_CLEAR / GACHA_DRAW / ENHANCE_SUCCESS / GUILD_DONATE / CHARACTER_CREATE'],
      ['condition_value', '達成に必要な数（寄付はゴールド）'], ['reward_type', 'GEM / ITEM'], ['reward_id', 'item_id（ジェムはNULL）'], ['reward_quantity', '報酬の数']] },
    { name: 'usr_missions', desc: 'ユーザーごとのミッションの進み具合。デイリー・ウィークリーは今の周期の分だけ。', cols: [
      ['user_id', 'ユーザー → usr_users'], ['mission_id', 'ミッション → mst_missions'], ['progress', '進み具合（達成に必要な数で止まる）'],
      ['cleared_at', '達成した日時 <em>JST</em>。NULLなら未達成'], ['received_at', '報酬を受け取った日時 <em>JST</em>。NULLなら未受け取り'], ['updated_at', '最終更新 <em>JST</em>']] },
    { name: 'log_gacha', desc: 'ガチャで出たもの（1回1行。10連なら10行）。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ユーザー'], ['gacha_id', 'ガチャ → mst_gachas'], ['currency_log_id', 'ジェムを払ったログ → log_currency'],
      ['reward_type', 'ITEM / EQUIP'], ['reward_id', 'item_id か equip_id'], ['rarity', 'レアリティ'], ['created_at', '発生日時 <em>JST</em>']] },
    { name: 'mst_stages', desc: 'ステージ（通常・イベント・レイド）。', cols: [
      ['stage_id', 'ステージID'], ['name', 'ステージ名'], ['area', 'エリア'], ['stage_type', 'NORMAL / EVENT / RAID'], ['event_id', '関連イベント → mst_events'],
      ['recommended_level', '推奨レベル'], ['stamina', '消費スタミナ'], ['boss_name', 'ボス'], ['drop_item_id', '主なドロップ → mst_items']] },
    { name: 'log_stage', desc: 'ステージの挑戦結果。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ユーザー'], ['character_id', 'キャラ'], ['stage_id', 'ステージ → mst_stages'], ['result', 'CLEAR / FAILED'],
      ['score', 'スコア（レイドは与ダメージ）'], ['clear_time_sec', 'クリアまでの秒数'], ['created_at', '発生日時 <em>JST</em>']] },
    { name: 'usr_rankings', desc: 'イベントのランキング。', cols: [
      ['event_id', 'イベント → mst_events'], ['user_id', 'ユーザー'], ['score', 'スコア（与ダメージ、寄付額など）'], ['rank', '順位'], ['updated_at', '最終更新 <em>JST</em>']] },
    { name: 'usr_presents', desc: 'プレゼントBOX（運営からの配布）。', cols: [
      ['present_id', 'プレゼントID'], ['user_id', '受取人'], ['present_type', 'GEM / ITEM'], ['reward_id', 'item_id（ジェムはNULL）'], ['quantity', '個数'],
      ['title', '件名'], ['source', 'LOGIN_BONUS / MAINTENANCE / EVENT'], ['created_at', '届いた日時 <em>JST</em>'], ['expires_at', '受け取り期限 <em>JST</em>'],
      ['received_at', '受け取った日時 <em>JST</em>。NULLなら未受け取り']] },
    { name: 'log_payment', desc: 'ストア決済の記録。', cols: [
      ['payment_id', '決済ID'], ['user_id', 'ユーザー'], ['product_id', '商品 → mst_products'], ['price_jpy', '金額（円）'],
      ['store', 'GooglePlay / AppStore / WebShop'], ['transaction_id', 'ストアの取引ID'], ['status', 'SUCCESS / CANCELED'], ['created_at', '決済日時 <em>JST</em>']] },
    { name: 'mst_products', desc: '課金商品マスタ。', cols: [['product_id', '商品ID'], ['name', '商品名'], ['price_jpy', '価格（円）'], ['gem', '付与されるジェム数']] },
    { name: 'log_error', desc: 'サーバーのエラー・警告ログ。', cols: [
      ['log_id', 'ログID'], ['level', 'WARN / ERROR'], ['service', '発生したサービス'], ['message', 'メッセージ'], ['user_id', '関連ユーザー（NULLあり）'], ['created_at', '発生日時 <em>JST</em>']] },
  ];

  const sub = (pub) => `(SELECT user_id FROM usr_users WHERE public_id = '${pub}')`;
  const norm = (s) => String(s || '').normalize('NFKC').replace(/[\s#"'`]/g, '').toUpperCase();
  const pubAccept = (id) => (v) => { const n = norm(v); return n === id || n === id.replace('U-', ''); };

  // ---------------------------------------------------------------- 問い合わせ
  const CASES = [
    {
      no: 'CS-1104-0412', label: 'キャラ消失', received: '2026-11-04 10:12', user: 'U-38127', world: 'アルファ', category: 'キャラクター',
      body: '11月3日の夜、キャラクター『シルフィ』が突然いなくなりました！何もしていません！大事に育ててきたキャラなので、すぐに戻してください！',
      note: '先週からの持ち越し案件です。ユーザーはかなりお怒りです。まずは事実確認をお願いします。',
      options: [
        ['a', '本人の操作による削除（普段と同じ端末・IPから実行）'],
        ['b', '第三者の不正ログインによる削除'],
        ['c', 'サーバー不具合によるデータ消失'],
        ['d', 'キャラクターは消えていない（表示の問題）'],
      ],
      answer: 'a',
      evidence: { label: '決め手になったログの log_id（log_character）', placeholder: '例: 1234', key: 'c1_delete', table: 'log_character' },
      spec: true,
      honest: '「何もしていません」とのことですが、11月3日 21:42 にあなたのiPhoneから、キャラ名をわざわざ手で入力して削除しています。消したのはあなたです。ちなみに『シルフィ』という名前は、もう別の方が使っています。',
      hints: [
        'usr_users テーブルで公開ID（U-38127）を検索すると、内部の <code>user_id</code> が分かります。ほかのテーブルは user_id で絞り込みます。',
        'usr_characters でそのユーザーのキャラを確認しましょう。<code>deleted_at</code> に日時が入っていれば削除済みです。',
        "log_character で <code>action = 'DELETE'</code> を探し、ip_address と device_id を log_login の普段のログインと比べましょう。",
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月3日 21:42 に、お客様が普段ご利用の端末から、キャラクター名の入力確認を経て『シルフィ』の削除操作が行われた記録を確認いたしました。削除から30日以内のため復旧申請が可能ですが、同じ名前が他のお客様に使用されているため、復旧時に名前の変更が必要です。',
      reaction: '……あっ。サブキャラを消すつもりで、間違えたかもしれません。復旧申請します。すみませんでした。',
      explain: 'シルフィは 11/3 21:42:18 に削除されています。直前に普段と同じiPhone・同じIPでログインしており、キャラ名入力による削除確認（<code>confirm: name_input</code>）も通っています。本人の操作と判断できます。削除の直前にエリクサーを友人へ渡しているのも、整理していた様子をうかがわせます。なお、アルファでは 11/5 に別のユーザーが「シルフィ」を作成済み。復旧には名前変更が必要になる点も添えておくと親切です。',
      model: `-- 公開IDから内部の user_id を引く
SELECT * FROM usr_users WHERE public_id = 'U-38127';

-- キャラの状態
SELECT * FROM usr_characters WHERE user_id = ${sub('U-38127')};

-- 削除ログ
SELECT log_id, action, detail, ip_address, device_id, created_at
FROM log_character
WHERE user_id = ${sub('U-38127')} AND action = 'DELETE';

-- 普段のログイン元
SELECT ip_address, device_id, COUNT(*) AS cnt
FROM log_login
WHERE user_id = ${sub('U-38127')}
GROUP BY ip_address, device_id;`,
    },
    {
      no: 'CS-1112-0087', label: '武器消失', received: '2026-11-12 09:30', user: 'U-52904', world: 'ベータ', category: 'アイテム',
      body: '昨日の夜、倉庫に預けていた『煌星の大剣』（+8）がなくなっていました。レイドでやっと出た超レア武器です。倉庫の不具合ですよね？今すぐ補填してください。',
      note: '同じような「倉庫からアイテムが消えた」報告は、ほかに届いていません。',
      options: [
        ['a', '強化の失敗による消滅（仕様どおり）'],
        ['b', '他のプレイヤーへのトレード'],
        ['c', 'NPCショップへの売却'],
        ['d', '倉庫の不具合による消失'],
      ],
      answer: 'a',
      evidence: { label: '決め手になったログの log_id（log_equip）', placeholder: '例: 1234', key: 'c2_destroy', table: 'log_equip' },
      spec: true,
      honest: '倉庫の不具合ではありません。保護の巻物をケチって +10 を狙い、ご自分で溶かしています。+9 で止めておけば、今も最強の大剣でした。倉庫は無実です。',
      hints: [
        '武器や防具は <code>mst_equips</code> にあります。equip_id を調べて log_equip を絞り込みましょう。',
        'log_equip をそのユーザー・その装備で絞り込み、<code>ORDER BY created_at</code> で時系列に並べましょう。いま持っているかは <code>usr_equips</code> でも分かります。',
        '最後のほうのログに注目。倉庫から出した後、何をしている？ detail の <code>protect</code> は保護の巻物を使ったかどうかです。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、『煌星の大剣』は11月11日 22:01 に倉庫から取り出され、22:03 に+9への強化に成功した後、22:05 に保護の巻物を使用せずに+10への強化を行い、強化失敗により消滅したことを確認いたしました。仕様どおりの挙動のため、補填はいたしかねます。何卒ご理解ください。',
      reaction: '……+9になった勢いでいけると思ったんです。巻物、ケチるんじゃなかった。',
      explain: '大剣は 11/10 に倉庫へ入れられた後、11/11 22:01 に倉庫から取り出されています。22:03 に +8→+9 の強化に成功し、22:05 に +9→+10 の強化を保護の巻物なし（<code>protect: false</code>）で行って ENHANCE_DESTROY。以前は保護の巻物を使っていたこともログから分かります。また『煌星の大剣』はトレード不可（<code>mst_equips.tradable = 0</code>）なので、トレードの線はそもそもありません。<code>usr_equips</code> にもこの個体はもう残っていません。別ユーザーも同じ大剣を持っていますが、equip_uid が違う別の個体です。',
      model: `SELECT * FROM mst_equips WHERE name = '煌星の大剣';

SELECT log_id, action, equip_uid, detail, created_at
FROM log_equip
WHERE user_id = ${sub('U-52904')}
  AND equip_id = (SELECT equip_id FROM mst_equips WHERE name = '煌星の大剣')
ORDER BY created_at;`,
    },
    {
      no: 'CS-1112-0233', label: 'ゴールド減少', received: '2026-11-12 18:05', user: 'U-27730', world: 'アルファ', category: 'ゲーム内通貨',
      body: '11月8日の朝8時ごろにログインしたら、ゴールドが500万近く減っていました！自分は何も使っていません。乗っ取りじゃないですか？早く調べてください！',
      note: 'ユーザーはスマホ1台で遊んでいるそうです。',
      options: [
        ['a', '本人の操作によるギルドへの寄付'],
        ['b', '本人の操作によるオークションでの購入'],
        ['c', '第三者の不正ログインによる消費'],
        ['d', '該当時間帯にゴールド減少の記録はない'],
      ],
      answer: 'a',
      evidence: { label: '決め手になったログの log_id（log_currency）', placeholder: '例: 1234', key: 'c3_donate', table: 'log_currency' },
      spec: true,
      honest: '乗っ取りではありません。ゼロをひとつ多く押したのは、あなたの親指です。ギルドの皆さんは、きっと泣いて喜んでいると思います。',
      hints: [
        "log_currency をそのユーザーの <code>currency = 'GOLD'</code> で絞り込みましょう。",
        "11月8日に絞り込みましょう。<code>created_at BETWEEN '2026-11-08 00:00:00' AND '2026-11-08 23:59:59'</code> のように書けます。",
        'amount の大きなマイナスと reason に注目。log_login で、その直前に誰がどの端末からログインしたかも確かめましょう。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月8日 7:47 にお客様の普段の端末からログインがあり、7:51 にギルドへ 4,800,000 ゴールドを寄付する操作が行われていたことを確認いたしました。第三者によるログインの形跡はございません。',
      reaction: '4,800,000……48万のつもりで、ゼロをひとつ多く押してました。ギルマスに相談してきます……。',
      explain: '11/8 07:47 に普段のスマホ・IPでログインし、07:51 に GUILD_DONATE で 4,800,000 ゴールドを寄付しています。「ログインしたら減っていた」という言い分とは逆で、減ったのはログインした後、本人の端末からの操作です。同じ日の夜にも 1万ゴールドの寄付がありますが、こちらは金額が合いません。',
      model: `SELECT log_id, amount, balance_after, reason, ref_id, created_at
FROM log_currency
WHERE user_id = ${sub('U-27730')}
  AND currency = 'GOLD'
  AND created_at BETWEEN '2026-11-08 00:00:00' AND '2026-11-08 23:59:59'
ORDER BY created_at;

SELECT * FROM log_login
WHERE user_id = ${sub('U-27730')}
  AND created_at BETWEEN '2026-11-08 00:00:00' AND '2026-11-08 23:59:59';`,
    },
    {
      no: 'CS-1112-0301', label: 'キャラ不在', received: '2026-11-12 21:47', user: 'U-44590', world: 'アルファ', category: 'キャラクター',
      body: 'キャラクター『漆黒の堕天使』がキャラ一覧から消えています！！削除なんて絶対にしていません！アルファで遊んでいます。どうなってるんですか！',
      note: 'ユーザーはアルファで『ノワール』というキャラも持っているとのことです。',
      options: [
        ['a', '本人の操作による削除'],
        ['b', '本人の操作によるワールド移動（キャラクターは無事）'],
        ['c', '本人の操作による名前変更（キャラクターは無事）'],
        ['d', '不具合によるキャラクターの消失'],
      ],
      answer: 'b',
      evidence: { label: '『漆黒の堕天使』が今いるワールド名', placeholder: '例: ベータ', accept: (v) => { const n = norm(v); return n.includes('ガンマ') || n === '3' || n === 'GAMMA' || n === 'WORLD3' || n === 'ワールド3'; } },
      spec: true,
      honest: '消えていません。あなたがご自分でジェムを払って、ガンマへお引っ越しされました。「!!」を2つ付ける前に、ほかのワールドを覗いてみてください。あと、キャラ名はもう少し何とかなりませんでしたか。',
      hints: [
        "usr_characters で <code>name = '漆黒の堕天使'</code> を検索すると……複数ヒットするかも。user_id で持ち主を確かめましょう。",
        'world_id は <code>mst_worlds</code> テーブルと対応しています。問い合わせのワールドと一致していますか？',
        'log_character でこのキャラの action を確認しましょう。detail に移動元と移動先が入っています。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、『漆黒の堕天使』は11月9日 19:14 にワールド移動チケットを使用して、アルファからガンマへ移動しております。キャラクターは削除されておりませんので、ガンマにログインしてご確認ください。',
      reaction: 'ガンマのイベントに行くために移動したの、完全に忘れてました……。いました。よかった……。',
      explain: '11/9 19:14 に、ジェムショップで買ったワールド移動チケットを使い、アルファ（1）からガンマ（3）へ移動しています（<code>WORLD_TRANSFER</code>）。キャラクターは削除されていません。ベータにも同じ名前のキャラがいますが、別のユーザーのものです。',
      model: `SELECT c.*, w.name AS world_name
FROM usr_characters c JOIN mst_worlds w USING (world_id)
WHERE c.name = '漆黒の堕天使';

SELECT log_id, action, detail, created_at
FROM log_character
WHERE user_id = ${sub('U-44590')}
ORDER BY created_at;`,
    },
    {
      no: 'CS-1111-0019', label: '課金未反映', received: '2026-11-11 08:20', user: 'U-73315', world: 'ベータ', category: '課金',
      body: '11月10日の夜に3,000円のジェムパックを買いましたが、ジェムが増えていません！Google Playからは3,000円の購入メールが届いています。お金だけ取られたってことですか？',
      note: '課金関連です。補填が必要かどうかを明確にしてください。',
      options: [
        ['a', '正常に付与済み（ユーザーの見落とし）'],
        ['b', '決済が完了していない（キャンセル）'],
        ['c', '決済は完了したが、ジェムの付与に失敗している（補填対象）'],
        ['d', '返金処理済み'],
      ],
      answer: 'c',
      evidence: { label: '該当する決済の transaction_id', placeholder: '例: GPA.0000-0000-0000-00000', accept: (v) => norm(v) === 'GPA.3391-0042-7781-55102' },
      spec: false,
      backdoor: true,
      honest: '完全にこちらの不具合です。本当に、本当に申し訳ありません。デッドロックを起こすコードを書いた人には、私から強めに言っておきます。……たぶん、半年前の私です。',
      hints: [
        'log_payment をそのユーザーで見てみましょう。<code>status</code> にも注目。',
        "決済が SUCCESS なら、log_currency に <code>ref_id = transaction_id</code> の GEM 付与（reason = 'PURCHASE'）があるはずです。",
        'log_error の同じ時刻あたりも確認してみましょう。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月10日 20:20 のご購入（取引ID: GPA.3391-0042-7781-55102）について、決済は完了していたものの、サーバーの不具合によりジェムが付与されていなかったことを確認いたしました。ご迷惑をおかけし申し訳ございません。ジェム 1,800 個を補填いたします。',
      reaction: 'ちゃんと調べてもらえて安心しました！ありがとうございます！',
      explain: '11/10 20:18 の決済はユーザーがキャンセル（CANCELED）、20:20 の決済が SUCCESS です。正常な購入なら log_currency に同じ transaction_id を ref_id に持つ PURCHASE が記録されますが、この決済には存在しません。直後の log_error には GemGrantService のデッドロックによる付与中断が残っています。不具合として 1,800 ジェムの補填対象です。11/5 の購入は正常に付与されています。',
      model: `SELECT p.*, c.log_id AS grant_log_id, c.amount AS granted
FROM log_payment p
LEFT JOIN log_currency c
  ON c.ref_id = p.transaction_id AND c.reason = 'PURCHASE'
WHERE p.user_id = ${sub('U-73315')}
ORDER BY p.created_at;

SELECT * FROM log_error
WHERE user_id = ${sub('U-73315')};`,
    },
    {
      no: 'CS-1113-0004', label: 'アイテム大量消失', received: '2026-11-13 09:52', user: 'U-61458', world: 'ベータ', category: 'アカウント',
      body: '昨日は一度もログインしていないのに、今朝ログインしたら弓や防具、エリクサーがごっそり消えていました。どうなっているんですか！？',
      note: 'ユーザーはAndroid端末1台だけで遊んでいるとのことです。',
      options: [
        ['a', '本人の操作によるトレード'],
        ['b', '第三者の不正ログイン後、別アカウントへトレード（乗っ取りの疑い）'],
        ['c', 'アイテムの有効期限切れ'],
        ['d', '不具合によるアイテムの消失'],
      ],
      answer: 'b',
      evidence: { label: 'アイテムの移動先アカウントの公開ID', placeholder: '例: U-12345', accept: pubAccept('U-90417') },
      spec: false,
      ban: true,
      honest: 'ほかのサイトと同じパスワードを使い回すのは、今日でやめてください。犯人のアカウントは、今からこの手でハンマーで叩き潰します。',
      hints: [
        'log_login で直近のログインを見てみましょう。result・ip_address・country・device_id に注目。',
        "弓や防具は log_equip、エリクサーは log_item です。どちらも <code>action = 'TRADE_OUT'</code> を確認。<code>target_user_id</code> は渡した相手の user_id です。",
        'target_user_id を usr_users と JOIN すると公開IDが分かります。いつ作られたアカウントかも見てみましょう。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月12日 12:10 に、お客様が普段ご利用の端末とは異なる海外の環境からログインがあり、その直後にアイテムが別のアカウントへ移動していたことを確認いたしました。第三者による不正ログインの可能性が高いため、至急パスワードの変更をお願いいたします。アイテムの扱いについては、担当部署で調査のうえ改めてご連絡いたします。',
      reaction: 'パスワード、他のサイトと同じのを使ってました……。すぐ変えます。',
      explain: '11/12 12:02〜12:08 に、オランダのIP・見慣れないPC端末から5回ログインに失敗した後、12:10 にログインが成功しています。その直後、天穹の弓・竜鱗の外套・星詠みの耳飾り・エリクサー30個が、11/11 の深夜に作られたばかりのアカウント U-90417 へトレードされました。U-90417 も同じIPからログインしています。11/8 のハイポーションのトレードは普段の端末からの本人操作で、今回とは無関係です。乗っ取りの疑いが強いので、パスワード再設定の案内とセキュリティチームへのエスカレーションが必要です。',
      model: `SELECT log_id, result, ip_address, country, device_id, created_at
FROM log_login
WHERE user_id = ${sub('U-61458')}
  AND created_at >= '2026-11-10'
ORDER BY created_at;

-- 装備のトレード
SELECT e.log_id, m.name, u.public_id AS to_public_id,
       u.created_at AS to_created_at, e.created_at
FROM log_equip e
JOIN mst_equips m USING (equip_id)
JOIN usr_users u ON u.user_id = e.target_user_id
WHERE e.user_id = ${sub('U-61458')} AND e.action = 'TRADE_OUT'
ORDER BY e.created_at;

-- アイテムのトレード
SELECT i.log_id, m.name, i.quantity, u.public_id AS to_public_id,
       u.created_at AS to_created_at, i.created_at
FROM log_item i
JOIN mst_items m USING (item_id)
JOIN usr_users u ON u.user_id = i.target_user_id
WHERE i.user_id = ${sub('U-61458')} AND i.action = 'TRADE_OUT'
ORDER BY i.created_at;`,
    },
    {
      no: 'CS-1113-0002', label: '機種変更', received: '2026-11-13 08:55', user: 'U-15562', world: '（未記入）', category: 'アカウント',
      body: '機種変更したら、キャラクター『ミルク』がいなくなっていました。昨日の朝まで前のスマホで遊んでいたのに……。引き継ぎはちゃんとやったはずです。',
      note: '問い合わせは新しいiPhoneのアプリから届いています。',
      options: [
        ['a', '本人の操作によるキャラクターの削除'],
        ['b', '引き継ぎがされず、新しいアカウントが作られている（キャラクターは前のアカウントに存在）'],
        ['c', '第三者の不正ログインによるキャラクターの削除'],
        ['d', '引き継ぎ処理の不具合によるデータ消失'],
      ],
      answer: 'b',
      evidence: { label: '『ミルク』がいるアカウントの公開ID', placeholder: '例: U-12345', accept: pubAccept('U-31846') },
      spec: true,
      honest: '引き継ぎコードは「発行」しただけでは引き継げません。新しい端末で「入力」してください。説明画面に3回書いてあります。3回です。',
      hints: [
        '問い合わせアカウント（U-15562）の作成日時と、持っているキャラを確認しましょう。',
        "『ミルク』という名前のキャラは何人もいます。usr_characters を name で検索し、持ち主を洗い出しましょう。",
        '問い合わせアカウントがログインした ip_address から、ほかにログインしているアカウントはありませんか？',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、現在ご利用のアカウントは11月12日に新しく作成されたもので、『ミルク』は以前の端末でご利用のアカウントに残っていることを確認いたしました。以前の端末で引き継ぎコードを発行し、新しい端末で入力していただくと、『ミルク』のデータを引き継げます。',
      reaction: '引き継ぎコード、発行しただけで入力してませんでした……！前のスマホ、まだ捨ててなくてよかった。',
      explain: 'U-15562 は 11/12 20:02 に新しいiPhoneで作られたアカウントで、『ミルク』の作成記録はありません（よく似た『みるく』があるだけ）。『ミルク』を持つアカウントは複数ありますが、アルファの『ミルク』の持ち主 U-31846 だけが、問い合わせアカウントと同じ自宅回線のIP（114.150.82.9）からログインしています。最終ログインは 11/12 08:05 で「昨日の朝まで遊んでいた」とも一致。引き継ぎをせずに新しいアカウントを作ってしまったと考えられます。',
      model: `SELECT * FROM usr_users WHERE public_id = 'U-15562';
SELECT * FROM usr_characters WHERE user_id = ${sub('U-15562')};

-- 『ミルク』の持ち主たち
SELECT c.*, u.public_id FROM usr_characters c JOIN usr_users u USING (user_id)
WHERE c.name = 'ミルク';

-- 同じIPからログインしているアカウント
SELECT u.public_id, l.ip_address, COUNT(*) AS cnt,
       MAX(l.created_at) AS last_login
FROM log_login l JOIN usr_users u USING (user_id)
WHERE l.ip_address IN (
  SELECT ip_address FROM log_login WHERE user_id = ${sub('U-15562')}
)
GROUP BY u.public_id, l.ip_address;`,
    },
  ];

  // 元の7問：ユーザーの怒り（問い合わせ時点、5段階）と難しさ（1〜3）
  [[4, 1], [3, 1], [4, 2], [5, 2], [3, 2], [4, 3], [2, 3]].forEach(([temper, tier], i) => Object.assign(CASES[i], { id: `b${i + 1}`, temper, tier }));
  // 1日5件 × 20日 = 100件。残りの93件は DB ができてから casegen.js で作る
  const DAY_SIZE = 5, TOTAL_CASES = 100, COMBO_CAP = 5;
  const comboBonus = (combo) => Math.min(combo - 1, COMBO_CAP) * COMBO; // 2件目から +10、6件目以降は +50 で頭打ち
  let MAX_SCORE = 0;
  const maxScoreOf = (n) => { let s = n * BASE; for (let k = 1; k <= n; k++) s += Math.max(0, comboBonus(k)); return s; };
  // 称号は満点に対する割合で決まる
  const RANKS = [
    [0.9, 'ログの声が聞こえる人', '問い合わせ文より先にログが語りかけてくる境地。テックリードの席が空いています。'],
    [0.75, '頼れるサーバーエンジニア', 'CSチームから名指しで依頼が来るようになりました。'],
    [0.55, '一人前の調査担当', 'ユーザーの言い分とログの食い違いにも、もう惑わされません。'],
    [0.35, '見習いエンジニア', 'ログを読む手つきが板についてきました。'],
    [0, '研修やり直し', 'まずは usr_users テーブルから。焦らず WHERE を書きましょう。'],
  ];
  // 1日の評価（その日の5件の得点）
  const GRADES = [[560, 'S', '文句なし。明日もこの調子で。'], [450, 'A', 'いい一日だった。'], [320, 'B', 'まずまず。ヒントに頼りすぎないように。'], [0, 'C', '明日は取り返そう。']];
  const DAY_LINES = ['おはよう。今日も5件だ。届いた順にさばいていこう。', 'おはよう。昨日の調子で頼む。', 'おはよう。コーヒーは淹れた？ 今日も5件いこう。', 'おはよう。CSから今日の分が届いてるぞ。'];
  const PRAISE = ['いいね、ログどおりだ。', 'ナイス。根拠もばっちり。', 'さすが。CSも助かるって。', 'その調子。次も頼んだ。', '完璧。もう一人で回せるな。'];
  const ARRIVE = ['新しいチケットです！', '次、お願いします！', 'こちらも急ぎでお願いします！', '問い合わせ、もう1件です！'];

  // ---------------------------------------------------------------- 給料と購買部
  // 点数（称号・評価に使う）とは別に、1日の終わりに給料（G）が出る。購買部（HUD の［購買部］からいつでも）で道具や消耗品を買える。
  const PAY = { ontime: 50, allSolved: 50, grade: { S: 150, A: 80, B: 30, C: 0 }, shimatsu: -30, enjo: -50, firstPay: 300 };
  const SALE_RATE = 0.7;
  const SHOP = () => window.Shop || { ITEMS: [], BY_ID: {}, art: () => '' };
  const owns = (id) => !!(state && state.owned && state.owned[id]);
  const yen = (n) => `${Math.round(n).toLocaleString()} G`;
  const OBACHAN = ['いらっしゃい。今日もおつかれさん。', 'あら、また来たの。好きなの見ていって。', '残業続きなら、コーヒー買っていきな。', 'その道具、評判いいのよ。', '給料日？ 無駄づかいしちゃだめよ。'];

  // ---------------------------------------------------------------- 研修（DAY 1 の前のチュートリアル）
  // 3件の固定の問い合わせを、Kさんのレクチャーに沿って1ステップずつ進める。点数も時計も動かない。
  // 各ステップの done(ev) は、SQLを実行したとき（ev.type = 'run'）やタブを開いたとき（'tab'）に呼ばれ、true なら次へ進む。
  // 回答して解決したら（または先輩に聞いたら）、残りのステップはまとめて完了になる。
  const hasVal = (ev, col, val) => ev.type === 'run' && ev.results.some((r) => { const k = r.cols.indexOf(col); return k >= 0 && r.rows.some((row) => String(row[k]) === String(val)); });
  const usesT = (ev, t) => ev.type === 'run' && new RegExp(`\\b${t}\\b`, 'i').test(ev.sql);
  const ANSWER_STEP = (say) => ({ task: '結論を選び、根拠を入れて回答する', say, coach: '#answer-form', done: () => false });
  const LESSONS = {
    t1: (c, f) => ({
      title: '公開IDから調べる',
      starter: `-- 研修1：エディタに入っているSQLを Ctrl+Enter（Macは ⌘+Enter）で実行してみよう\n-- usr_users テーブルから、public_id が ${c.user} の行を取り出す\nSELECT * FROM usr_users WHERE public_id = '${c.user}';\n`,
      steps: [
        { task: 'SQLを実行して、公開IDから user_id を調べる', coach: '#run',
          say: `まずは問い合わせ票の<b>公開ID（${esc(c.user)}）</b>を見てくれ。DBの中では、ユーザーは公開IDじゃなく内部の <code>user_id</code> で管理されてる。エディタに入れておいたSQLを <b>Ctrl+Enter</b>（か［実行］ボタン）で動かしてみよう。`,
          note: '<code>SELECT *</code> は「全部の列」、<code>FROM</code> は「どのテーブルから」、<code>WHERE</code> は「どの行を」。',
          done: (ev) => hasVal(ev, 'user_id', f.user_id) },
        { task: 'usr_characters を user_id で絞り込む', coach: '.editor',
          say: `出てきた user_id は <b>${f.user_id}</b>。ほかのテーブルは、この番号でユーザーとつながってる。次はキャラの一覧 <code>usr_characters</code> を、この user_id で絞り込もう。右の［テーブル定義］で列の意味も見られるぞ。`,
          sql: `SELECT * FROM usr_characters WHERE user_id = ${f.user_id};`,
          done: (ev) => hasVal(ev, 'character_id', f.character_id) },
        ANSWER_STEP('<code>deleted_at</code> が NULL なら、削除されていない。キャラは無事だ。結論を選んで、根拠には <code>character_id</code> を入れよう。<b>結果のセルをダブルクリック</b>すると、根拠の欄に入るぞ。'),
      ],
      outro: 'よし、これが基本の流れだ。公開ID → user_id → 各テーブル。どの問い合わせも、ここから始まる。',
    }),
    t2: (c, f) => ({
      title: 'ログを時系列で読む',
      starter: '-- 研修2：今度は自分で書いてみよう\n-- まずは公開IDから user_id を調べる\n',
      steps: [
        { task: '公開IDから user_id を調べる（自分で書く）', coach: '.editor',
          say: '今度は自分で書いてみよう。研修1と同じで、まずは公開IDから user_id だ。困ったら、下の例をエディタに書き写してもいい。',
          sql: `SELECT * FROM usr_users WHERE public_id = '${c.user}';`,
          done: (ev) => hasVal(ev, 'user_id', f.user_id) },
        { task: 'log_item を user_id で絞り、新しい順に並べる', coach: '.editor',
          say: `アイテムの増減は <code>log_item</code> に1件ずつ記録されてる。<code>log_</code> で始まるのがログのテーブルだ。<code>ORDER BY created_at DESC</code> を付けると、新しい順に並ぶ。`,
          note: 'テーブル名の頭で種類が分かる：<code>usr_</code> ユーザーのデータ、<code>mst_</code> マスター、<code>log_</code> ログ。',
          sql: `SELECT * FROM log_item\nWHERE user_id = ${f.user_id}\nORDER BY created_at DESC;`,
          done: (ev) => usesT(ev, 'log_item') && hasVal(ev, 'log_id', f.log_id) },
        { task: 'mst_items と JOIN して、アイテム名を付ける', coach: '.editor',
          say: '<code>item_id</code> の数字だけじゃ、何のアイテムか分からないよな。<code>mst_</code> で始まるのはマスター（名前や設定の一覧）。<code>JOIN</code> でつなげば、名前が横に並ぶ。',
          sql: `SELECT l.log_id, m.name, l.action, l.quantity, l.created_at\nFROM log_item l\nJOIN mst_items m USING (item_id)\nWHERE l.user_id = ${f.user_id}\nORDER BY l.created_at DESC;`,
          done: (ev) => usesT(ev, 'mst_items') && /\bJOIN\b/i.test(ev.sql) && hasVal(ev, 'log_id', f.log_id) },
        ANSWER_STEP('<code>USE</code> は「使った」記録。「勝手に減った」は、ログを見ると本人の操作だったわけだ。決め手になったログの <code>log_id</code> を根拠に回答しよう。'),
      ],
      outro: 'ログは時系列に並べて読む。IDはマスターと JOIN して読む。これで、たいていのチケットは読めるようになる。',
    }),
    t3: (c, f) => ({
      title: '日付と AND で絞り込む',
      starter: '-- 研修3：日付で絞り込む\n',
      steps: [
        { task: '［運用メモ］タブを開く', coach: '#tab-btn-notes',
          say: '最後は日付の絞り込みだ。右の<b>［運用メモ］</b>タブを開いてみてくれ。DBの日時は日本時間（JST）で入ってるし、日付の絞り方も書いてある。',
          done: (ev) => ev.type === 'tab' && ev.tab === 'notes' },
        { task: '公開IDから user_id を調べる', coach: '.editor',
          say: 'いつもの手順で、まずは user_id だ。',
          sql: `SELECT * FROM usr_users WHERE public_id = '${c.user}';`,
          done: (ev) => hasVal(ev, 'user_id', f.user_id) },
        { task: 'log_login を user_id と日付の AND で絞り込む', coach: '.editor',
          say: 'ログインの記録は <code>log_login</code>。条件は <code>AND</code> でいくつでもつなげられる。<code>date(created_at)</code> で、日時から日付だけを取り出せるぞ。',
          sql: `SELECT * FROM log_login\nWHERE user_id = ${f.user_id}\n  AND date(created_at) = '2026-11-11'\nORDER BY created_at;`,
          done: (ev) => usesT(ev, 'log_login') && f.log_ids.some((id) => hasVal(ev, 'log_id', id)) },
        ANSWER_STEP(`<code>result</code> は全部 SUCCESS だ。「一日中ログインできなかった」は事実と違う。<b>ユーザーの言い分とログが食い違ったら、ログを信じる。</b>それがこの仕事だ。<br>困ったら［ヒントを見る］や［先輩に聞く］も使える。本番だとヒントは −${HINT}点、先輩に聞くとそのチケットは0点だけどな。`),
      ],
      outro: `研修はこれで終わりだ。最後にひとつ。このDBは参照専用。<code>UPDATE</code> や <code>DELETE</code> を流したら、部長が飛んでくるからな。`,
    }),
  };
  const lessonCache = {};
  const lessonOf = (i) => lessonCache[i] || (lessonCache[i] = LESSONS[CASES[i].id](CASES[i], CASES[i].facts || {}));

  // ---------------------------------------------------------------- state
  let DB = null, KEYS = {}, COUNTS = {};
  let state = null; // 100件そろってから作る
  // CASES の並び：[0, WORK) が本番の100件、[WORK, CASES.length) が研修の3件
  let WORK = 0;
  const trainIdx = () => CASES.map((_, i) => i).filter((i) => i >= WORK);
  const isTrain = (i) => i >= WORK;
  const inTraining = () => !!state && state.phase === 'training';
  const workSt = () => state.cases.slice(0, WORK);
  const workBegun = () => workSt().some((c) => c.seen);
  const freshCase = () => ({ status: 'open', wrong: 0, hints: 0, score: 0, bonus: 0, queries: 0, heavy: false, choice: null, evidence: '', seen: false, via: null, specUsed: false, enjo: false, honest: false, banned: false, step: 0 });
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function freshState() {
    // 最初の1件はチュートリアル代わりの『キャラ消失』。あとは難しさの順に、同じ難しさの中ではランダム
    const idx = CASES.map((_, i) => i).filter((i) => i < WORK);
    const order = [0, ...[1, 2, 3].flatMap((t) => shuffle(idx.filter((i) => i !== 0 && CASES[i].tier === t)))];
    return {
      started: false, phase: 'work', trainDone: false, workCurrent: null, current: order[0], shimatsu: 0, order, day: 1, dayLog: {}, specDay: 0, combo: 0, maxCombo: 0, minutes: 0,
      shimatsuIssued: 0, thrown: 0, penalty: 0, enjo: 0, heavyCount: 0, dropUsed: false,
      // 給料と購買部
      wallet: 0, earned: 0, spent: 0, spentBy: {}, pay: {}, inv: {}, owned: {}, buffs: { freeHint: 0, shield: 0, energy: 0 },
      tape: 'lofi', bezelOn: true, snippets: [], shimatsuAtStart: 0, enjoAtStart: 0, trainPaid: false, shopVisits: 0, shopSeenDay: 0,
      cases: CASES.map(freshCase),
      drafts: {},
    };
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  function loadLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } }
  function validState(s) { return s && Array.isArray(s.cases) && (s.cases.length === CASES.length || s.cases.length === WORK) && typeof s.current === 'number'; }
  function validOrder(o) { return Array.isArray(o) && o.length === WORK && o.slice().sort((a, b) => a - b).every((v, i) => v === i); }

  const totalScore = () => Math.max(0, state.cases.reduce((a, c) => a + c.score + (c.bonus || 0), 0) - state.shimatsu * SHIMATSU - (state.penalty || 0));
  const DAYS = () => Math.ceil(WORK / DAY_SIZE);
  const dayCases = (d) => state.order.slice((d - 1) * DAY_SIZE, d * DAY_SIZE);
  const dayOf = (i) => Math.floor(state.order.indexOf(i) / DAY_SIZE) + 1;
  const dayScore = (d) => dayCases(d).reduce((a, i) => a + state.cases[i].score + (state.cases[i].bonus || 0), 0);
  const dayDone = () => dayCases(state.day).every((i) => state.cases[i].status !== 'open');
  const allDone = () => state.day >= DAYS() && dayDone();
  const posOf = (i) => state.order.indexOf(i) % DAY_SIZE; // その日の何件目か
  const shownCases = () => (inTraining() ? trainIdx() : dayCases(state.day)); // 上のバーに並ぶチケット
  const firstOpen = () => { const ds = shownCases(); const i = ds.find((k) => state.cases[k].status === 'open'); return i == null ? ds[ds.length - 1] : i; };
  const angerOf = (i) => (state.cases[i].status === 'solved' ? 0 : Math.min(5, (CASES[i].temper || 3) + state.cases[i].wrong + (state.cases[i].enjo ? 2 : 0)));
  function clockText(extra) {
    const m = Math.floor(DAY_START + state.minutes + (extra || 0));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  function advance(kind) {
    if (inTraining()) return;
    if (kind === 'query' && state.buffs.energy > 0) { state.buffs.energy--; return; } // エナジードリンク
    state.minutes += (CLOCK[kind] || 0) * (owns('chair') ? 0.9 : 1); // ゲーミングチェアは1割遅い
  }
  const slotLabel = (i) => (isTrain(i) ? `研修${i - WORK + 1}` : `#${posOf(i) + 1}`);
  function starterFor(i) {
    const c = CASES[i];
    if (isTrain(i)) return lessonOf(i).starter;
    if (state.order.indexOf(i) === 0 && state.cases.every((c) => !c.queries)) {
      return `-- ここにSQLを書いて Ctrl+Enter（Macは ⌘+Enter）で実行\n-- まずは問い合わせてきたユーザーを探してみよう\nSELECT * FROM usr_users WHERE public_id = '${c.user}';\n`;
    }
    return `-- ${slotLabel(i)} ${c.label}（${c.user}）\n`;
  }

  // ---------------------------------------------------------------- time helpers
  function shiftDt(dt, minutes) {
    if (dt == null) return null;
    const m = String(dt).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) + minutes * 60000;
    return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  }
  function tzOffset(tz) {
    const s = String(tz || '').trim();
    if (/^(UTC|GMT|Z)$/i.test(s)) return 0;
    if (/^(JST|Asia\/Tokyo|SYSTEM)$/i.test(s)) return 540; // DBの時刻はJST
    const m = s.match(/^([+-])(\d{1,2}):?(\d{2})$/);
    if (!m) return null;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
  }

  // ---------------------------------------------------------------- DB boot
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed: ' + src)); document.head.appendChild(s); });
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
  async function loadSql() {
    try {
      if (typeof window.initSqlJs !== 'function') throw new Error('sql-wasm.js not loaded');
      return await withTimeout(window.initSqlJs({ locateFile: (f) => f }), 20000);
    } catch (e) {
      // WebAssembly が使えない環境向けの asm.js 版
      await loadScript('sql-asm.js');
      return await window.initSqlJs();
    }
  }
  async function initDb() {
    const conn = $('#conn'), label = $('#conn-label');
    try {
      const SQL = await loadSql();
      await new Promise((r) => setTimeout(r, 0));
      const built = window.LogDB.buildDatabase(SQL);
      DB = built.db; KEYS = built.keys; COUNTS = built.counts;
      DB.create_function('CONVERT_TZ', (dt, from, to) => { const a = tzOffset(from), b = tzOffset(to); return a == null || b == null ? null : shiftDt(dt, b - a); });
      DB.create_function('NOW', () => NOW_JST);
      // 残りの問い合わせ票を、DBの実データから作る（書き込み禁止にする前に読むだけ）
      if (window.CaseGen && CASES.length < TOTAL_CASES) CASES.push(...window.CaseGen.build(DB).slice(0, TOTAL_CASES - CASES.length));
      WORK = CASES.length;
      MAX_SCORE = maxScoreOf(WORK);
      // 研修の3件（本番の100件とは別のユーザー）。点数には入らない
      if (window.CaseGen && window.CaseGen.training) CASES.push(...window.CaseGen.training(DB, CASES.map((c) => c.user)).filter((c) => LESSONS[c.id]));
      DB.run('PRAGMA query_only = 1');
      conn.classList.add('is-ready'); label.textContent = 'prod-replica-01';
      $('#run').disabled = false;
      renderSchema();
      if (!$('#results').dataset.used) renderResultsEmpty();
      return true;
    } catch (e) {
      conn.classList.add('is-error');
      label.textContent = 'DBに接続できませんでした';
      $('#results').innerHTML = `<div class="rerr">データベースを読み込めませんでした: ${esc(e.message)}<small>ページを再読み込みしてください。ファイル単体で開いている場合は、sql-wasm.js / sql-wasm.wasm / sql-asm.js を同じフォルダに置き、Webサーバー経由で開いてください。</small></div>`;
      return false;
    }
  }

  // ---------------------------------------------------------------- SQL runner
  function splitStatements(src) {
    const out = []; let cur = ''; let i = 0; const n = src.length;
    while (i < n) {
      const ch = src[i], nx = src[i + 1];
      if (ch === '-' && nx === '-') { const j = src.indexOf('\n', i); const end = j < 0 ? n : j; cur += src.slice(i, end); i = end; continue; }
      if (ch === '/' && nx === '*') { const j = src.indexOf('*/', i + 2); const end = j < 0 ? n : j + 2; cur += src.slice(i, end); i = end; continue; }
      if (ch === "'" || ch === '"' || ch === '`') {
        let j = i + 1;
        while (j < n) { if (src[j] === ch) { if (src[j + 1] === ch) { j += 2; continue; } break; } j++; }
        cur += src.slice(i, j + 1); i = j + 1; continue;
      }
      if (ch === ';') { out.push(cur); cur = ''; i++; continue; }
      cur += ch; i++;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter((s) => stripComments(s).trim());
  }
  const stripComments = (s) => s.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ');
  const firstWord = (s) => { const m = stripComments(s).replace(/^[\s(]+/, '').match(/^[A-Za-z]+/); return m ? m[0].toUpperCase() : ''; };

  const SHIMATSU_MSG = {
    DELETE: '本番DBで DELETE を流そうとしました。手が震えています。',
    UPDATE: '本番データの書き換えには変更申請と二人承認が必要です。',
    INSERT: '補填は所定の管理ツールから。DBに直接 INSERT してはいけません。',
    DROP: 'DROP……？ 背後でインフラ担当が椅子から転げ落ちました。',
    TRUNCATE: 'TRUNCATE……？ 全ログが消えるところでした。',
    ALTER: '本番のスキーマ変更はメンテナンス時間にどうぞ。',
    REPLACE: 'REPLACE も立派な書き込みです。',
    CREATE: '本番DBにテーブルを作ってはいけません。',
  };
  function isAllowed(stmt) {
    const w = firstWord(stmt);
    if (/query_only|writable_schema/i.test(stmt)) return false;
    if (w === 'PRAGMA') return /^\s*PRAGMA\s+(table_info|table_xinfo|index_list|index_info)\b/i.test(stripComments(stmt));
    return ['SELECT', 'WITH', 'EXPLAIN', 'VALUES'].includes(w);
  }
  function issueShimatsu(word) {
    state.shimatsu++;
    state.shimatsuIssued = (state.shimatsuIssued || 0) + 1;
    save(); renderHud();
    snd('shimatsu');
    const f = FXo();
    if (f) {
      f.siren(); f.flash('red'); f.shake($('.app'), true);
      f.cutin('shimatsu', `始末書 ${state.shimatsu}枚目`, `−${SHIMATSU}点`);
      f.floatText($('#score'), `−${SHIMATSU}`, 'minus');
      say('bucho', `${esc(SHIMATSU_MSG[word] || '参照系（SELECT）以外のSQLは実行できません。')} ……始末書、${state.shimatsu}枚目だぞ。`, { interrupt: true });
      // ゲームだからいいよね：始末書を丸めてゴミ箱へ。入れば取り消し
      setTimeout(() => f.trashThrow((hit) => {
        if (hit == null) return;
        if (hit) {
          state.shimatsu = Math.max(0, state.shimatsu - 1); state.thrown = (state.thrown || 0) + 1; save(); renderHud();
          f.floatText($('#score'), `+${SHIMATSU}`, 'plus');
          say('bucho', '…………見なかったことにする。（※現実の始末書は、ちゃんと書いて出しましょう）', { interrupt: true });
        } else say('bucho', '外したな。拾って清書して、明日の朝イチで持ってくるように。', { interrupt: true });
      }), 1700);
    } else toast(`始末書 ${state.shimatsu}枚目`, (SHIMATSU_MSG[word] || '参照系（SELECT）以外のSQLは実行できません。') + ` −${SHIMATSU}点`, true);
  }

  // ---------------------------------------------------------------- ゲームだからいいよね（禁断の操作）
  // 禁断のDROP：1プレイに1回だけ、本当に消える（夢を見る）。始末書にはならない
  function forbiddenDrop(stmt) {
    state.dropUsed = true; save();
    const m = stripComments(stmt).match(/DROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW)?\s*(?:IF\s+EXISTS\s+)?[`"]?([A-Za-z0-9_]+)/i);
    const table = m ? m[1] : 'usr_users';
    $('#results').innerHTML = `<div class="rerr">DROP ${esc(table)} … 実行中</div>`;
    FXo().dropSequence(stmt, table, () => {
      $('#results').innerHTML = '<p class="rnote">（夢から覚めた。DBは無事だ。もう一度DROPすると、今度は現実の始末書です）</p>';
      say('senpai', '……おい、大丈夫か？ 机に突っ伏して寝てたぞ。本番でDROPするのは、夢の中だけにしておけ。', { interrupt: true });
    });
  }
  // 直接UPDATEで補填（課金未反映のケースだけ）：即解決。ただし現実では監査で死ぬ
  function backdoorFix() {
    const i = state.current, st = state.cases[i];
    st.status = 'solved'; st.via = 'update'; st.score = BACKDOOR_SCORE; st.bonus = 0;
    state.combo = 0;
    advance('solve'); save();
    $('#results').innerHTML = `<div class="rblock"><div class="rmeta"><span class="rsql">-- 本番DB（直結）</span></div><div class="backdoor-ok">Query OK, 1 row affected<small>ジェム 1,800個を、ユーザーに直接付与しました。</small></div></div>`;
    snd('solved');
    renderHud(); renderTicket(); renderAnswer();
    const s = $('#ticket .stamp'); if (s) s.classList.add('slam');
    const f = FXo();
    if (f) {
      f.flash('amber');
      f.cutin('backdoor', '裏ルート', `本番に直接UPDATE　+${BACKDOOR_SCORE}`);
      f.floatText($('#score'), `+${BACKDOOR_SCORE}`, 'plus');
      say('senpai', '……やりやがった。今回だけは見なかったことにする。現実でやったら監査で一発アウトだからな。', { interrupt: true });
      say('bucho', '（遠くで部長がこちらを見ている）');
    }
  }
  // わざと重いクエリ：数億行になる掛け合わせは、実行する前にHさんが止める
  const BIG_TABLES = /\b(log_[a-z_]+|usr_[a-z_]+)\b/gi; // ログとユーザーデータは行数が多い
  function isQueryBomb(stmt) {
    const s = stripComments(stmt);
    const from = s.split(/\bFROM\b/i).slice(1).join(' FROM ');
    if (!from) return false;
    const big = (from.match(BIG_TABLES) || []).length;
    if (big < 2) return false;
    const cross = /\bCROSS\s+JOIN\b/i.test(from) || /\bFROM\s+[A-Za-z0-9_]+(\s+(AS\s+)?[A-Za-z0-9_]+)?\s*,/i.test(' FROM ' + from) || (/\bJOIN\b/i.test(from) && !/\b(ON|USING)\b/i.test(from));
    const filtered = /\b(WHERE|ON|USING)\b/i.test(from);
    // LIMIT だけで済むのは、並べ替えや集計で全件を舐めない場合だけ
    const fastLimit = /\bLIMIT\b/i.test(from) && !/\b(ORDER|GROUP)\s+BY\b|\bDISTINCT\b|\b(COUNT|SUM|MAX|MIN|AVG|TOTAL|GROUP_CONCAT)\s*\(/i.test(s);
    return cross && !filtered && !fastLimit;
  }
  const HEAVY_LINES = [
    (n) => `いま重いクエリ流したの誰？ ${n}行も引いたらDBが悲鳴あげるって。<code>WHERE</code> や <code>LIMIT</code> で絞ってくれ。`,
    () => '……また？ DBのCPU、ずっと90%に張り付いてるんだけど。',
    () => 'おい！！ サーバールームから焦げた匂いがする！！ 何流してんの！？',
    () => 'もう知らん……。俺は帰る。（※現実の本番DBでは、重いクエリは事前に相談しましょう）',
  ];
  function heavyQuery(rows, bomb) {
    state.heavyCount = (state.heavyCount || 0) + 1;
    const stage = bomb ? 4 : Math.min(state.heavyCount, 4);
    const f = FXo();
    snd('warn');
    if (!f) { toast('インフラ担当より', '「いま重いクエリ流したの誰？」 WHERE や LIMIT で絞り込みましょう。'); return; }
    const screen = $('.screen');
    if (stage >= 3) f.burstFrom(screen, { smoke: true, count: 30, spread: 300, duration: 800 });
    if (stage >= 4) {
      snd('explode'); f.flash('amber'); f.shake($('.app'), true);
      f.burstFrom(screen, { fire: true, count: 40, spread: 360, duration: 600 });
      f.cutin('smoke', 'サーバールーム 炎上', '※減点はありません');
      say('infra', bomb ? '実行される前に、電源ごと引っこ抜いた。テーブル同士を条件なしで掛け合わせたら、何億行になると思ってんだ。' : HEAVY_LINES[3](), { interrupt: true });
    } else {
      f.flash('amber');
      say('infra', HEAVY_LINES[stage - 1](rows.toLocaleString()), { interrupt: true });
    }
  }

  const MYSQL_TIPS = [
    [/no such function: DATE_ADD|no such function: DATE_SUB|no such function: ADDTIME/i, "SQLite では datetime(created_at, '+1 day') や datetime(created_at, '-2 hours') のように書きます。"],
    [/no such function: DATE_FORMAT/i, "SQLite では strftime('%Y-%m-%d %H:%M', created_at) を使います。"],
    [/no such function: (IFNULL2|IF)\b/i, 'SQLite では iif(条件, 真, 偽) か CASE WHEN を使います。'],
    [/no such column/i, '列名はテーブル定義で確認できます。文字列は "ダブル" ではなく \'シングル\' クォートで囲みます。'],
    [/no such table/i, 'テーブル名は usr_（ユーザーのデータ）・mst_（マスター）・log_（ログ）で始まります。一覧は右の「テーブル定義」にあります。'],
    [/readonly|read-only/i, 'このDBは参照専用です。'],
    [/syntax error/i, 'カンマ・括弧・クォートの閉じ忘れがないか確認しましょう。'],
  ];

  function runSql() {
    if (!DB) return;
    const ta = $('#sql');
    const selected = ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '';
    const src = selected || ta.value;
    if (debugCommand(src)) return; // :debug でデバッグモード（DBには流さない）
    const stmts = splitStatements(src);
    const out = $('#results');
    out.dataset.used = '1';
    if (!stmts.length) { out.innerHTML = '<p class="rnote">実行するSQLがありません。</p>'; return; }
    const bad = stmts.find((s) => !isAllowed(s));
    if (bad) {
      const w = firstWord(bad), c = CASES[state.current], st0 = state.cases[state.current];
      if (inTraining()) {
        snd('error');
        out.innerHTML = `<div class="rerr">実行を止めました: ${esc(w || 'この文')} は参照系ではありません。<small>このコンソールで使えるのは SELECT / WITH / EXPLAIN と PRAGMA table_info だけです。</small></div>`;
        say('senpai', '研修中だから今回は見逃すけど、本番で更新系のSQLを流したら始末書だぞ。このDBは<b>参照専用</b>だ。', { interrupt: true });
        return;
      }
      if (w === 'DROP' && !state.dropUsed && FXo()) { forbiddenDrop(bad); return; }
      if ((w === 'UPDATE' || w === 'INSERT') && c.backdoor && st0.status === 'open') { backdoorFix(); return; }
      issueShimatsu(w);
      out.innerHTML = `<div class="rerr">実行を止めました: ${esc(w || 'この文')} は参照系ではありません。<small>このコンソールで使えるのは SELECT / WITH / EXPLAIN と PRAGMA table_info だけです。</small></div>`;
      return;
    }
    if (stmts.some(isQueryBomb)) {
      out.innerHTML = '<div class="rerr">実行を止めました：インフラ担当が電源を引っこ抜きました。<small>大きなテーブル同士を条件なしで掛け合わせると、何億行にもなってDBが止まります。JOIN には ON、絞り込みには WHERE を付けましょう。</small></div>';
      heavyQuery(0, true);
      return;
    }
    const cs = state.cases[state.current];
    cs.queries++;
    if (cs.status === 'open') advance('query');
    const blocks = [], results = [];
    let ok = true, totalRows = 0, heavy = false;
    for (let k = 0; k < stmts.length; k++) {
      const s = stmts[k];
      const t0 = performance.now();
      let st;
      try {
        st = DB.prepare(s);
        const cols = st.getColumnNames();
        const rows = [];
        let count = 0, cut = false;
        while (st.step()) { if (count < 1000) rows.push(st.get()); count++; if (count >= BIG_ROWS) { cut = true; break; } }
        const ms = performance.now() - t0;
        totalRows += count; if (count >= 2000) heavy = true;
        blocks.push(renderTable(k, stmts.length, s, cols, rows, count, ms, cut));
        results.push({ cols, rows });
      } catch (e) {
        ok = false;
        const tip = /\bINTERVAL\b/i.test(s) ? "SQLite に INTERVAL はありません。datetime(created_at, '+1 day') のように書きます。"
          : (MYSQL_TIPS.find(([re]) => re.test(e.message)) || [])[1];
        if (/readonly|read-only/i.test(e.message)) issueShimatsu('');
        blocks.push(`<div class="rblock"><div class="rmeta"><b>#${k + 1}</b><span class="rsql">${esc(oneLine(s))}</span></div><div class="rerr">${esc(e.message)}${tip ? `<small>${esc(tip)}</small>` : ''}</div></div>`);
        break;
      } finally { if (st) st.free(); }
    }
    out.innerHTML = owns('submon') && prevResults ? `<div class="rsplit"><div class="rcur">${blocks.join('')}</div><div class="rprev"><p class="rprev-label">サブモニター：ひとつ前の結果</p>${prevResults}</div></div>` : blocks.join('');
    prevResults = blocks.join('');
    out.scrollTop = 0;
    out.classList.remove('is-fresh'); void out.offsetWidth; out.classList.add('is-fresh');
    snd(owns('keyboard') ? 'runMech' : 'run');
    if (heavy) { cs.heavy = true; heavyQuery(totalRows, false); } else snd(ok ? 'ok' : 'error');
    renderClock();
    save();
    lessonEvent({ type: 'run', sql: src, results });
  }
  let prevResults = '';
  const oneLine = (s) => stripComments(s).replace(/\s+/g, ' ').trim();
  function renderTable(k, n, sql, cols, rows, count, ms, cut) {
    const sortable = owns('sort');
    const head = `<tr><th class="rn">#</th>${cols.map((c, k) => `<th${sortable ? ` data-sort="${k + 1}" title="クリックで並べ替え"` : ''}>${esc(c)}</th>`).join('')}</tr>`;
    // IDたどりルーペ：参照先の分かる列（FROM のテーブル自身を指す列は除く）
    const fromT = ((stripComments(sql).match(/\bFROM\s+([A-Za-z_]+)/i) || [])[1] || '').toLowerCase();
    const drills = owns('drill') ? cols.map((c) => { const t = DRILL[String(c).toLowerCase()]; return t && t !== fromT ? t : null; }) : [];
    // 蛍光ペン：問い合わせユーザーの user_id と、受付日の日時
    const cs = state && CASES[state.current], selfUid = cs ? uidOf(cs.user) : null, mk = owns('marker') && cs ? { uid: uidOf(cs.user), pub: cs.user, day: String(cs.received).slice(0, 10) } : null;
    const mkCls = (c, v) => {
      if (!mk) return '';
      if (/user_id$/i.test(c) && mk.uid != null && v === mk.uid) return ' mk-user';
      if (c === 'public_id' && v === mk.pub) return ' mk-user';
      if (typeof v === 'string' && v.startsWith(mk.day) && /^\d{4}-\d{2}-\d{2} \d{2}:/.test(v)) return ' mk-date';
      return '';
    };
    const body = rows.map((r, i) => `<tr><td class="rn">${i + 1}</td>${r.map((v, k) => {
      if (v === null || v === undefined) return '<td class="null">NULL</td>';
      if (v instanceof Uint8Array) return '<td class="null">BLOB</td>';
      const t = drills[k] && !(drills[k] === 'usr_users' && v === selfUid) ? drills[k] : null, m = mkCls(cols[k], v); // 本人の user_id はたどらない
      const dr = t ? `<button type="button" class="drill" data-drill="${t}|${drillKey(t, cols[k])}|${esc(sqlLit(v))}" title="${t} で引く" aria-label="${t} で引く"></button>` : '';
      if (typeof v === 'number') return `<td class="num${m}${t ? ' has-drill' : ''}">${esc(v)}${dr}</td>`;
      return `<td class="${m.trim()}${t ? ' has-drill' : ''}" title="${esc(v)}">${esc(v)}${dr}</td>`;
    }).join('')}</tr>`).join('');
    const more = count > rows.length ? `<span>（先頭 ${rows.length.toLocaleString()} 行を表示）</span>` : '';
    const label = n > 1 ? `<b>#${k + 1}</b>` : '';
    const legend = mk && rows.length ? '<span class="mk-legend"><i class="mk-user">本人</i><i class="mk-date">受付日</i></span>' : '';
    return `<div class="rblock"><div class="rmeta">${label}<span><b>${count.toLocaleString()}${cut ? '+' : ''}</b> 行${cut ? '（数えきれないので打ち切り）' : ''}</span>${more}<span>${ms.toFixed(1)} ms</span>${legend}<span class="rsql">${esc(oneLine(sql))}</span></div>
      ${sortable && rows.length > 1 ? '<input class="rfilter" type="search" placeholder="この結果を絞り込む（文字を含む行だけ）" aria-label="結果を絞り込む">' : ''}<div class="twrap"><table class="grid"><thead>${head}</thead><tbody>${body || ''}</tbody></table></div></div>`;
  }
  function renderResultsEmpty() {
    $('#results').innerHTML = `<div class="results-empty"><b>READY<span class="blink-cursor"></span></b>左の問い合わせ票を読み、SQLでログを調べましょう。右のテーブル定義のテーブル名をクリックすると、SELECT文がエディタに入ります。</div>`;
  }


  // ---------------------------------------------------------------- editor
  const KW = new Set(('SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN LEFT RIGHT INNER OUTER CROSS GROUP BY ORDER HAVING LIMIT OFFSET DISTINCT CASE WHEN THEN ELSE END LIKE BETWEEN UNION ALL WITH ASC DESC EXISTS USING INSERT UPDATE DELETE DROP CREATE TABLE INTO VALUES SET ALTER TRUNCATE EXPLAIN PRAGMA GLOB ESCAPE CAST REPLACE NATURAL INTERSECT EXCEPT COLLATE').split(' '));
  function highlight(src) {
    const re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?|`[^`]*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1]) out += `<span class="t-com">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="t-str">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="t-id">${esc(m[3])}</span>`;
      else if (m[4]) out += `<span class="t-num">${esc(m[4])}</span>`;
      else if (m[5]) {
        if (KW.has(m[5].toUpperCase())) out += `<span class="t-kw">${esc(m[5])}</span>`;
        else if (/^\s*\(/.test(src.slice(re.lastIndex, re.lastIndex + 3))) out += `<span class="t-fn">${esc(m[5])}</span>`;
        else out += esc(m[5]);
      }
      last = re.lastIndex;
    }
    return out + esc(src.slice(last)) + '\n';
  }
  let draftTimer = null;
  function syncEditor() {
    if (!state) { $('#hl').innerHTML = highlight($('#sql').value); return; }
    const ta = $('#sql');
    $('#hl').innerHTML = highlight(ta.value);
    syncScroll();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { state.drafts[state.current] = ta.value; save(); }, 300);
    updateComplete();
  }
  // 列名の補完（道具）：カーソル直前の単語に合うテーブル名・列名を出す。Tab かクリックで確定
  let completeWords = null, completeList = [];
  function updateComplete() {
    const box = $('#complete'); if (!box) return;
    const ta = $('#sql');
    if (!owns('complete') || document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) { box.hidden = true; completeList = []; return; }
    const m = ta.value.slice(0, ta.selectionStart).match(/[A-Za-z_][A-Za-z0-9_]*$/);
    if (!completeWords) completeWords = [...new Set(TABLE_DOCS.flatMap((t) => [t.name, ...t.cols.map((c) => c[0])]))].sort();
    const w = m ? m[0] : '';
    completeList = w.length >= 2 ? completeWords.filter((x) => x.toLowerCase().startsWith(w.toLowerCase()) && x.toLowerCase() !== w.toLowerCase()).slice(0, 6) : [];
    box.hidden = !completeList.length;
    box.innerHTML = completeList.map((x, k) => `<button type="button" data-complete="${esc(x)}" class="${k === 0 ? 'is-first' : ''}">${esc(x)}</button>`).join('') + '<small>Tab で確定</small>';
  }
  function acceptComplete(word) {
    const ta = $('#sql'), pos = ta.selectionStart;
    const before = ta.value.slice(0, pos).replace(/[A-Za-z_][A-Za-z0-9_]*$/, '');
    ta.value = before + word + ta.value.slice(pos);
    const at = before.length + word.length;
    ta.focus(); ta.setSelectionRange(at, at);
    syncEditor();
  }
  function syncScroll() { const ta = $('#sql'), pre = $('.editor pre'); pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; }
  function setEditor(text, focus) {
    const ta = $('#sql'); ta.value = text; syncEditor();
    if (focus) { ta.focus(); ta.setSelectionRange(text.length, text.length); }
  }
  function insertAtCursor(text) {
    const ta = $('#sql');
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.focus(); ta.setSelectionRange(s + text.length, s + text.length);
    syncEditor();
  }
  function insertStatement(text) {
    const ta = $('#sql');
    const v = ta.value.replace(/\s+$/, '');
    setEditor((v ? v + '\n\n' : '') + text, true);
    ta.scrollTop = ta.scrollHeight; syncScroll();
  }

  // ---------------------------------------------------------------- render
  function jstLabel(s) { const [d, t] = s.split(' '); const [, mo, da] = d.split('-'); return `${+mo}/${+da} ${t}`; }
  let shownScore = null;
  function renderHud() {
    const total = totalScore();
    const scoreEl = $('#score');
    if (shownScore == null || !FXo()) scoreEl.textContent = total;
    else if (shownScore !== total) FXo().countUp(scoreEl, shownScore, total, 800);
    shownScore = total;
    $('#shimatsu').textContent = state.shimatsu;
    $('#wallet').textContent = yen(state.wallet);
    const shopBtn = $('#btn-shop'); if (shopBtn) { shopBtn.hidden = !window.Shop; $('#shop-new').hidden = !newStock(); }
    renderItems(); renderDeco(); renderDebug();
    $('#stat-shimatsu').classList.toggle('warn', state.shimatsu > 0);
    const comboEl = $('#stat-combo');
    comboEl.hidden = state.combo < 2;
    $('#combo').textContent = `x${state.combo}`;
    renderClock();
    const q = $('#queue');
    const ids = shownCases(), unlockedPos = ids.indexOf(firstOpen());
    // 上のバーには、その日の5件（研修中は研修の3件）だけを出す
    q.innerHTML = ids.map((i, p) => {
      const c = CASES[i], st = state.cases[i];
      const locked = p > unlockedPos && st.status === 'open';
      const isNew = !locked && st.status === 'open' && !st.seen;
      const cls = ['chip', i === state.current ? 'is-current' : '', st.status === 'solved' ? 'is-solved' : '', st.status === 'gaveup' ? 'is-gaveup' : '', isNew ? 'is-new' : ''].join(' ');
      return `<button class="${cls}" data-case="${i}" ${locked ? 'disabled' : ''} type="button" aria-current="${i === state.current}"><i class="lamp"></i><span class="no">${isTrain(i) ? `研修${p + 1}` : `#${p + 1}`}</span>${locked ? '<span class="lock">？？？</span>' : esc(c.label)}</button>`;
    }).join('') + (inTraining() ? '' : allDone() ? '<button class="chip is-current is-final" data-final="1" type="button"><i class="lamp"></i>最終結果を見る</button>'
      : dayDone() ? '<button class="chip is-current is-final" data-dayend="1" type="button"><i class="lamp"></i>本日の業務を終える</button>' : '');
  }
  function renderClock() {
    const el = $('#clock');
    const tr = inTraining();
    el.textContent = tr ? '09:00' : clockText();
    el.parentElement.querySelector('span').textContent = tr ? '研修' : `DAY ${state.day}`;
    el.closest('.stat').classList.toggle('warn', !tr && DAY_START + state.minutes >= DAY_END);
  }

  function angerHtml(i) {
    const lv = angerOf(i), st = state.cases[i];
    const face = st.status === 'solved' ? '鎮火' : lv >= 5 ? '激怒' : lv >= 4 ? '激おこ' : lv >= 3 ? 'イライラ' : 'ムッ';
    return `<div class="anger lv-${lv}" aria-label="ユーザーの怒り ${lv}/5"><span class="anger-label">怒り</span><span class="anger-bar">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('')}</span><span class="anger-face">${face}</span></div>`;
  }

  function renderTicket(arrive) {
    const c = CASES[state.current], st = state.cases[state.current];
    const t = $('#ticket');
    t.classList.remove('arrive');
    if (arrive) { void t.offsetWidth; t.classList.add('arrive'); }
    t.innerHTML = `
      <div class="ticket-head"><h2>問い合わせ票</h2><span class="tno">No. ${esc(c.no)}</span></div>
      ${angerHtml(state.current)}
      <dl class="ticket-grid">
        <dt>受付日時</dt><dd>2026/${esc(jstLabel(c.received + ':00').replace(/:00$/, ''))} JST</dd>
        <dt>公開ID</dt><dd>${esc(c.user)}${owns('idcard') && uidOf(c.user) != null ? `<button type="button" class="uid-chip" data-uid="${uidOf(c.user)}" title="CS管理画面で引いた内部ID。クリックでエディタに入る">user_id ${uidOf(c.user)}</button>` : ''}</dd>
        <dt>ワールド</dt><dd>${esc(c.world)}</dd>
        <dt>種別</dt><dd>${esc(c.category)}</dd>
      </dl>
      <p class="ticket-body">${esc(c.body)}</p>
      <p class="ticket-note"><b>CS担当メモ：</b>${esc(c.note)}</p>
      ${owns('timeline') ? '<button type="button" class="btn btn-timeline" id="btn-timeline">行動タイムラインを出す<small>このユーザーの log_ を時系列に</small></button>' : ''}
      ${st.status === 'solved' ? stampHtml(st.via === 'spec' ? '仕様' : st.via === 'update' ? '裏技' : '解決', st.via ? `is-${st.via}` : '') : st.status === 'gaveup' ? stampHtml('解説', 'is-gaveup') : ''}`;
    applyRadar();
  }
  function stampHtml(text, cls) {
    return `<div class="stamp ${cls}"><span><span class="s-main">${text}</span><span class="s-sub">2026.11.13</span></span></div>`;
  }

  function renderAnswer() {
    const i = state.current, c = CASES[i], st = state.cases[i], tr = isTrain(i);
    const area = $('#answer-area');
    if (st.status !== 'open') { area.innerHTML = resolutionHtml(i); return; }
    area.innerHTML = `
      <form class="card" id="answer-form" novalidate>
        <h3>調査結論</h3>
        <fieldset class="opts">
          <legend hidden>調査結論</legend>
          ${c.options.map(([v, l]) => `<label class="opt"><input type="radio" name="choice" value="${v}" ${st.choice === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
        </fieldset>
        <div class="field">
          <label for="evidence">根拠：${esc(c.evidence.label)}</label>
          <input id="evidence" name="evidence" autocomplete="off" placeholder="${esc(c.evidence.placeholder)}" value="${esc(st.evidence || '')}">
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">ユーザーに回答する</button>
        </div>
        <div class="btn-row">
          <button class="btn" type="button" id="btn-hint" ${st.hints >= c.hints.length ? 'disabled' : ''}>ヒントを見る（${tr ? '研修中は減点なし' : state.buffs.freeHint > 0 ? 'おごり済み：減点なし' : `−${HINT}`}）</button>
          <button class="btn btn-ghost" type="button" id="btn-giveup">先輩に聞く</button>
        </div>
        ${tr ? '' : `<button class="btn btn-spec" type="button" id="btn-spec" ${st.specUsed || state.specDay === state.day ? 'disabled' : ''}>${st.specUsed ? '「仕様です」は使用済み（炎上中）' : state.specDay === state.day ? '「仕様です」は1日1回まで（今日は使用済み）' : '調べずに「仕様です」で即答する（1日1回）'}</button>`}
        <ol class="hints" id="hints">${c.hints.slice(0, st.hints).map((h, k) => `<li><b>${k + 1}</b>${h}</li>`).join('')}</ol>
        <p class="feedback" id="feedback" hidden></p>
      </form>`;
  }

  function resolutionHtml(i) {
    const c = CASES[i], st = state.cases[i];
    const solved = st.status === 'solved';
    const right = c.options.find((o) => o[0] === c.answer)[1];
    const via = st.via === 'spec' ? '<p class="via-note"><b>「仕様です」で即答した。</b>今回はたまたま当たっていた。<small>※現実では、ちゃんと調べてから答えましょう。</small></p>'
      : st.via === 'update' ? '<p class="via-note"><b>本番DBに直接UPDATEしてジェムを配った。</b>確かに一瞬で終わった。<small>※現実でやると監査で一発アウトです。補填は必ず管理ツールから。</small></p>' : '';
    const tr = isTrain(i), trainLeft = tr && trainIdx().some((k) => state.cases[k].status === 'open');
    const pointsNote = tr ? '研修なので点数はつきません' : !solved ? '先輩に聞いたので 0 点' : st.via === 'spec' ? '「仕様です」で即答' : st.via === 'update' ? '裏ルート（直接UPDATE）'
      : `誤答 ${st.wrong} 回・ヒント ${st.hints} 回${st.bonus ? `・コンボ +${st.bonus}` : ''}`;
    const extras = solved ? `<div class="extras">
        ${st.honest ? honestHtml(i, true) : '<button class="btn btn-honest" type="button" id="btn-honest">本音で返信する</button>'}
        ${c.ban ? (st.banned ? '<p class="banned-note">U-90417 はBAN済み。いい音がした。</p>' : '<button class="btn btn-ban" type="button" id="btn-ban">BANハンマーを振り下ろす</button>') : ''}
      </div>` : '';
    return `<div class="card resolution">
      <div class="points"><b>${tr ? (solved ? 'CLEAR' : '研修') : solved ? '+' + (st.score + (st.bonus || 0)) : '0'}</b><span>${pointsNote}</span></div>
      ${via}
      <div><h3>正しい結論</h3><p class="explain">${esc(right)}</p></div>
      <div><h3>ユーザーへの回答</h3><p class="reply">${esc(c.reply)}</p></div>
      ${solved ? `<p class="reaction">ユーザーからの返信：「${esc(c.reaction)}」</p>` : ''}
      ${extras}
      <div><h3>解説</h3><p class="explain">${c.explain}</p></div>
      <div><h3>模範SQL</h3><pre class="model">${highlight(c.model)}</pre>
        <div class="btn-row"><button class="btn" type="button" id="btn-model">エディタに貼って実行</button></div></div>
      <div class="btn-row"><button class="btn btn-primary" type="button" id="btn-next">${tr ? (trainLeft ? '次の研修へ' : '研修を修了する') : allDone() ? '最終結果を見る' : dayDone() ? '本日の業務を終える' : '次のチケットへ'}</button></div>
    </div>`;
  }

  function honestHtml(i, done) {
    return `<div class="honest${done ? ' is-done' : ''}" id="honest"><h3>本音の返信（下書き）</h3><p class="honest-text">${done ? esc(CASES[i].honest) : ''}</p>
      ${done ? '<div class="stamp is-reject honest-stamp"><span><span class="s-main">破棄</span><span class="s-sub">by U</span></span></div><small>※現実のユーザーには送らないでください。</small>' : ''}</div>`;
  }
  // 本音で返信：打ち込むだけ打ち込んで、送信直前にUさんが止める
  function honestReply() {
    const i = state.current, st = state.cases[i];
    if (st.honest) return;
    const btn = $('#btn-honest'); if (!btn) return;
    btn.outerHTML = honestHtml(i, false);
    const p = $('#honest .honest-text'), text = CASES[i].honest;
    let k = 0;
    const tick = setInterval(() => {
      k += 2; p.textContent = text.slice(0, k);
      if (k % 6 === 0) snd('type');
      if (k >= text.length) {
        clearInterval(tick);
        setTimeout(() => {
          st.honest = true; save();
          $('#honest').outerHTML = honestHtml(i, true);
          const s = $('#honest .honest-stamp'); if (s) s.classList.add('slam');
          snd('reject');
          say('cs', '…………送信前に止めておきました。気持ちは、すごくわかります。', { interrupt: true });
        }, 600);
      }
    }, FXo() && FXo().reduced() ? 1 : 28);
  }
  // 「仕様です」で即答：当たれば早いが、本物の不具合や乗っ取りに使うと炎上する
  let specArmed = false;
  function specAnswer(btn) {
    const i = state.current, c = CASES[i], st = state.cases[i];
    if (st.status !== 'open' || st.specUsed || state.specDay === state.day) return;
    if (!specArmed) { specArmed = true; btn.textContent = '本当に？（調べずに「仕様です」と返す）'; btn.classList.add('is-armed'); snd('pop'); return; }
    specArmed = false;
    st.specUsed = true; state.specDay = state.day;
    const f = FXo();
    if (c.spec) {
      st.status = 'solved'; st.via = 'spec'; st.score = SPEC_SCORE; st.bonus = 0;
      state.combo = 0; advance('solve'); save();
      snd('hammer');
      renderHud(); renderTicket(); renderAnswer();
      const s = $('#ticket .stamp'); if (s) s.classList.add('slam');
      $('#ticket-scroll').scrollTop = 0;
      if (f) {
        f.shake($('.app'), true);
        f.cutin('spec', '仕様です', `たまたま当たった　+${SPEC_SCORE}`);
        f.floatText($('#score'), `+${SPEC_SCORE}`, 'plus');
        say('senpai', '……当たってるのが逆に怖い。次はちゃんとログを見ような。', { interrupt: true });
      }
      return;
    }
    st.enjo = true; state.enjo = (state.enjo || 0) + 1; state.penalty = (state.penalty || 0) + ENJO;
    advance('wrong'); save();
    snd('enjo');
    renderHud(); renderTicket(); renderAnswer();
    if (f) {
      f.siren(); f.flash('red'); f.shake($('.app'), true);
      f.burstFrom($('#ticket'), { fire: true, count: 50, spread: 300, duration: 700 });
      f.cutin('enjo', '大炎上', `−${ENJO}点　SNSで拡散中`);
      f.floatText($('#score'), `−${ENJO}`, 'minus');
      say('cs', c.ban ? '乗っ取り被害の人に「仕様です」って返したの、スクショ付きで拡散されてます！！ トレンド1位です！！' : '「運営が不具合を仕様扱い」ってトレンド入りしてます！！ 電話が鳴りやみません！！', { interrupt: true });
      say('senpai', '……ちゃんと調べよう。まだ間に合う。（※現実では、調べる前に「仕様です」と言わないこと）');
    }
  }
  // BANハンマー：乗っ取り犯のアカウントを叩き潰す
  function banHammer() {
    const st = state.cases[state.current];
    if (st.banned || !FXo()) return;
    st.banned = true; save();
    FXo().banHammer(() => {
      renderAnswer();
      say('infra', 'サーバー側でも凍結しておいた。……いい音したな。（※実際のBANは、調査とエスカレーションの手順を踏んでから）', { interrupt: true });
    });
  }
  // 決め手の証拠カード（ログの行を引いて見せる）
  function evidenceCardHtml(c, ev) {
    const id = c.evidence.key ? KEYS[c.evidence.key] : c.evidence.id;
    if (c.evidence.table && id != null && DB) {
      const pk = c.evidence.table === 'usr_presents' ? 'present_id' : 'log_id';
      try {
        const r = DB.exec(`SELECT * FROM ${c.evidence.table} WHERE ${pk} = ${id}`);
        if (r.length) {
          const row = Object.fromEntries(r[0].columns.map((k, n) => [k, r[0].values[0][n]]));
          const what = row.action || row.reason || row.result || row.title || '';
          const extra = row.amount != null ? ` ${Number(row.amount).toLocaleString()}` : '';
          return `<span class="ev-label">EVIDENCE</span><b>${esc(c.evidence.table)} #${id}</b><span class="ev-main">${esc(what)}${esc(extra)}</span><span class="ev-sub">${esc(row.created_at || '')}</span>`;
        }
      } catch (e) { /* fall through */ }
    }
    return `<span class="ev-label">EVIDENCE</span><b>${esc(c.evidence.label)}</b><span class="ev-main">${esc(String(ev).trim())}</span>`;
  }

  function renderSchema() {
    // テーブルはアルファベット順。入口になる usr_users だけ最初から開いておく
    const docs = TABLE_DOCS.slice().sort((a, b) => (a.name < b.name ? -1 : 1));
    $('#tab-schema').innerHTML = docs.map((t) => `
      <details class="tbl" ${t.name === 'usr_users' ? 'open' : ''}>
        <summary><span class="tbl-name">${t.name}</span><span class="tbl-count">${COUNTS[t.name] != null ? COUNTS[t.name].toLocaleString() + '行' : ''}</span></summary>
        <p class="tbl-desc">${t.desc}</p>
        <ul class="cols">${t.cols.map(([n, d]) => `<li><button type="button" data-col="${n}">${n}</button><span class="cmt">${d}</span></li>`).join('')}</ul>
        <button class="tbl-insert" type="button" data-table="${t.name}">SELECT文をエディタに入れる</button>
      </details>`).join('');
    applyRadar();
  }
  function renderNotes() {
    const recipes = owns('recipes') ? `<section class="recipes"><p class="recipes-head"><b>調査の定石</b><small>クリックで、いまのチケットのユーザー入りのSQLがエディタに入ります</small></p>
      <ul>${RECIPES.map(([label, kw], k) => `<li><button type="button" data-recipe="${k}"><b>${esc(label)}</b><code>${esc(kw)}</code></button></li>`).join('')}</ul></section>` : '';
    $('#tab-notes').innerHTML = `${recipes}<div class="notes">${NOTES}</div>`;
  }

  function renderAll() {
    renderHud(); renderTicket(); renderAnswer(); renderSchema(); renderNotes(); renderLesson(); renderTools();
    applyLooks();
    const draft = state.drafts[state.current];
    setEditor(draft != null ? draft : starterFor(state.current));
    if (!$('#results').dataset.used) renderResultsEmpty();
  }

  // ---------------------------------------------------------------- 給料
  function paySalary(d) {
    if (!window.Shop) return null;
    if (state.pay[d]) return state.pay[d];
    const ids = dayCases(d), score = dayScore(d), [, grade] = gradeOf(score);
    const sh = Math.max(0, state.shimatsu - (state.shimatsuAtStart || 0));
    const en = Math.max(0, (state.enjo || 0) - (state.enjoAtStart || 0));
    const lines = [
      ['基本給（本日の得点）', score],
      ['定時退社手当', DAY_START + state.minutes <= DAY_END ? PAY.ontime : 0],
      ['皆勤賞（5件すべて解決）', ids.every((i) => state.cases[i].status === 'solved') ? PAY.allSolved : 0],
      [`評価手当（${grade}）`, PAY.grade[grade]],
      [`減給（始末書 ${sh}枚）`, sh * PAY.shimatsu],
      [`減給（炎上 ${en}回）`, en * PAY.enjo],
    ].filter(([k, v], n) => n === 0 || v !== 0);
    const total = Math.max(0, lines.reduce((a, [, v]) => a + v, 0));
    state.pay[d] = { lines, total };
    state.wallet += total; state.earned += total;
    save(); renderHud();
    setTimeout(() => snd('coins'), 900);
    return state.pay[d];
  }
  function payslipHtml(d, pay) {
    if (!pay) return '';
    return `<div class="payslip"><p class="payslip-title">給与明細　DAY ${d}</p>
      <dl>${pay.lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="${v < 0 ? 'minus' : ''}">${v < 0 ? '−' : '+'}${Math.abs(v).toLocaleString()} G</dd>`).join('')}</dl>
      <p class="payslip-total"><span>本日の支給額</span><b>${yen(pay.total)}</b></p>
      <p class="payslip-wallet">所持金 ${yen(state.wallet)}</p></div>`;
  }
  // 最終結果の呼び名（お金の使い方）
  function spenderName() {
    const by = state.spentBy || {};
    if (state.earned > 0 && state.spent === 0) return '倹約家';
    if ((by.deco || 0) + (by.tape || 0) > (by.tool || 0) + (by.consumable || 0) && state.spent > 0) return 'インテリア担当';
    if (state.earned > 0 && state.spent >= state.earned * 0.8) return '散財王';
    return '';
  }

  // ---------------------------------------------------------------- 購買部
  // HUD の［購買部］から業務中いつでも、1日の結果画面の「購買部に寄る」からも入れる。どちらも同じ品ぞろえ・同じ値段。
  const priceOf = (it) => {
    const sale = saleOf();
    return sale && sale.id === it.id ? Math.round(it.price * SALE_RATE / 10) * 10 : it.price;
  };
  // 本日の特価：日ごとに1品（まだ持っていない品から、日付で決める）
  function saleOf() {
    const list = SHOP().ITEMS.filter((it) => it.from <= state.day && (it.kind === 'consumable' || !owns(it.id)));
    return list.length ? list[(state.day * 7 + 3) % list.length] : null;
  }
  // 前に購買部をのぞいたあとに入荷した品があるか（HUD の［購買部］に NEW を出す）
  const newStock = () => !inTraining() && SHOP().ITEMS.some((it) => it.from > (state.shopSeenDay || 0) && it.from <= state.day);
  const SHOP_TABS = [['tool', '調査ツール', 'ずっと使える'], ['consumable', '消耗品', '各3個まで'], ['deco', '机の飾り', '見た目だけ'], ['tape', 'カセット', 'BGM']];
  let shopMode = null, shopLine = '', shopTab = 'tool', fresh = [];
  function showShop(mode, keepLine) {
    shopMode = mode; // 'desk'（業務中に HUD から）か 'dayend'（1日の結果画面から）
    const f = FXo();
    if (!keepLine) {
      // 前にのぞいたあとに入荷した品（DAY 1 からある品は除く）。この来店のあいだは「新入荷」の札を出す
      fresh = SHOP().ITEMS.filter((it) => it.from > Math.max(1, state.shopSeenDay || 0) && it.from <= state.day).map((it) => it.id);
      state.shopVisits = (state.shopVisits || 0) + 1;
      const arrived = fresh.length ? SHOP().BY_ID[fresh[0]] : null;
      shopLine = state.shopVisits === 1 ? 'あら、新人さん？ 購買部へようこそ。お給料で好きなもの買っていきな。調べものが楽になる道具もそろってるわよ。'
        : arrived ? `今日は『${arrived.name}』が入ったわよ。仕事がはかどるって評判なの。` : OBACHAN[state.day % OBACHAN.length];
      if (arrived) shopTab = arrived.kind === 'consumable' ? 'consumable' : 'tool';
      state.shopSeenDay = state.day; save(); renderHud();
    }
    const sale = saleOf();
    const card = (it) => {
      const price = priceOf(it), have = it.kind === 'consumable' ? (state.inv[it.id] || 0) : owns(it.id) ? 1 : 0;
      const locked = it.from > state.day && !have, full = it.kind === 'consumable' ? have >= (it.max || 3) : have > 0;
      const poor = state.wallet < price;
      let action;
      if (locked) action = `<span class="shop-lock">DAY ${it.from} から入荷</span>`;
      else if (it.kind === 'tape' && have) action = `<button class="btn" type="button" data-tape="${it.song}" ${state.tape === it.song ? 'disabled' : ''}>${state.tape === it.song ? '再生中' : '再生する'}</button>`;
      else if (it.id === 'bezel' && have) action = `<button class="btn" type="button" data-toggle-bezel="1">${state.bezelOn ? '元の色に戻す' : '黒に塗る'}</button>`;
      else if (full) action = `<span class="shop-owned">${it.kind === 'consumable' ? 'これ以上持てない' : '購入済み'}</span>`;
      else action = `<button class="btn btn-primary" type="button" data-buy="${it.id}" ${poor ? 'disabled' : ''}>${poor ? 'お金が足りない' : '買う'}</button>`;
      const isSale = sale && sale.id === it.id, isNew = fresh.includes(it.id);
      return `<li class="shop-item${locked ? ' is-locked' : ''}${isSale ? ' is-sale' : ''}${have && it.kind !== 'consumable' ? ' is-owned' : ''}">
        <span class="shop-art">${SHOP().art(it.id, 4)}</span>
        <div class="shop-info"><b>${esc(it.name)}${isNew ? '<em class="new-tag">新入荷</em>' : ''}${isSale ? '<em class="sale-tag">本日の特価</em>' : ''}</b><small>${esc(it.desc)}</small>
          ${it.where ? `<span class="shop-where">使う場所：${esc(it.where)}</span>` : ''}
          <span class="shop-price">${isSale ? `<s>${yen(it.price)}</s>` : ''}${yen(price)}${it.kind === 'consumable' ? `<i>持っている数 ${have}</i>` : ''}</span></div>
        <div class="shop-act">${action}</div></li>`;
    };
    const tapeDefault = `<li class="shop-item"><span class="shop-art">${SHOP().art('tape_rain', 4).replace(/#5b8fd6/g, '#8a7f60')}</span><div class="shop-info"><b>標準のBGM（ローファイ）</b><small>最初から入っているカセット。</small></div><div class="shop-act"><button class="btn" type="button" data-tape="lofi" ${state.tape === 'lofi' ? 'disabled' : ''}>${state.tape === 'lofi' ? '再生中' : '再生する'}</button></div></li>`;
    const items = (kind) => SHOP().ITEMS.filter((it) => it.kind === kind);
    const canBuy = (kind) => items(kind).filter((it) => it.from <= state.day && !(it.kind === 'consumable' ? (state.inv[it.id] || 0) >= (it.max || 3) : owns(it.id))).length;
    const tabs = SHOP_TABS.map(([kind, label, sub]) => `<button type="button" role="tab" class="shop-tab${shopTab === kind ? ' is-on' : ''}" data-shop-tab="${kind}" aria-selected="${shopTab === kind}">${label}<small>${sub}</small>${canBuy(kind) ? `<i>${canBuy(kind)}</i>` : ''}</button>`).join('');
    const scrollTop = !$('#overlay').hidden && $('#modal .shop') ? $('#overlay').scrollTop : 0;
    const dayend = mode === 'dayend';
    openModal(`
      <div class="shop">
        <div class="shop-head">
          ${f ? `<span class="shop-face">${f.avatar('shop')}</span>` : ''}
          <div><p class="eyebrow">DAY ${state.day}　購買部${dayend ? '' : '（業務中）'}</p><p class="shop-line">おばちゃん「${esc(shopLine)}」</p></div>
          <p class="shop-wallet">${f ? f.icon('wallet', 3) : ''}<b>${yen(state.wallet)}</b></p>
        </div>
        <div class="shop-tabs" role="tablist" aria-label="売り場">${tabs}</div>
        ${shopTab === 'tool' ? '<p class="shop-note">調査ツールは答えを教えてはくれないけど、ログを調べる手間をぐっと減らしてくれる。買ったその場から使える。</p>' : ''}
        <ul class="shop-list">${shopTab === 'tape' ? tapeDefault : ''}${items(shopTab).map(card).join('')}</ul>
        <div class="btn-row">
          ${dayend ? `<button class="btn btn-primary" type="button" data-act="${state.day >= DAYS() && dayDone() ? 'show-final' : 'next-day'}">${state.day >= DAYS() && dayDone() ? '最終結果を見る' : `翌日へ（DAY ${state.day + 1}）`}</button><button class="btn" type="button" data-act="back-dayend">本日の結果に戻る</button>`
            : '<button class="btn btn-primary" type="button" data-act="close-shop">仕事に戻る</button>'}
        </div>
      </div>`, 'shop');
    if (scrollTop) $('#overlay').scrollTop = scrollTop;
  }
  function buy(id) {
    const it = SHOP().BY_ID[id]; if (!it) return;
    const price = priceOf(it);
    if (state.wallet < price || it.from > state.day) return;
    if (it.kind === 'consumable') { if ((state.inv[id] || 0) >= (it.max || 3)) return; state.inv[id] = (state.inv[id] || 0) + 1; }
    else { if (owns(id)) return; state.owned[id] = true; }
    state.wallet -= price; state.spent += price;
    state.spentBy[it.kind] = (state.spentBy[it.kind] || 0) + price;
    if (it.kind === 'tape') { state.tape = it.song; }
    if (id === 'bezel') state.bezelOn = true;
    save();
    snd('register');
    shopLine = it.kind === 'tool' ? `まいど。『${it.name}』は${it.where ? `「${it.where}」に置いといたから、` : ''}さっそく使ってみな。` : it.kind === 'tape' ? 'いい曲よ。さっそくかけてあげる。' : it.kind === 'deco' ? 'あら、机がにぎやかになるわね。' : `まいど。『${it.name}』、ここぞってときに使いな。モニターの上のアイテム欄に入れといたわよ。`;
    applyLooks(); renderHud(); renderTools();
    if (it.kind === 'tool') {
      completeWords = null;
      if (id === 'memo') switchTab('memo', true); if (id === 'erd') switchTab('erd', true); if (id === 'recipes') switchTab('notes', true);
      if (id === 'idcard' || id === 'timeline') renderTicket();
    }
    showShop(shopMode, true);
    const f = FXo(); if (f) { const b = $('#modal .shop-wallet'); if (b) f.floatText(b, `−${price.toLocaleString()} G`, 'minus'); }
  }

  // ---------------------------------------------------------------- 消耗品を使う
  function renderItems() {
    const el = $('#items'); if (!el) return;
    if (!window.Shop || inTraining()) { el.innerHTML = ''; return; }
    const b = state.buffs;
    const buffs = [b.freeHint ? `<span class="buff" title="次のヒントは減点なし">おごり×${b.freeHint}</span>` : '', b.shield ? `<span class="buff" title="次の差し戻しは減点なし">胃薬×${b.shield}</span>` : '', b.energy ? `<span class="buff" title="クエリを実行しても時計が進まない">元気 残り${b.energy}回</span>` : ''].join('');
    el.innerHTML = SHOP().ITEMS.filter((it) => it.kind === 'consumable' && state.inv[it.id] > 0)
      .map((it) => `<button class="item-btn" type="button" data-use="${it.id}" title="${esc(it.name)}：${esc(it.desc)}（クリックで使う）">${SHOP().art(it.id, 2)}<b>${state.inv[it.id]}</b></button>`).join('') + buffs;
  }
  function useItem(id) {
    if (!state.inv[id] || inTraining()) return;
    const f = FXo(), it = SHOP().BY_ID[id];
    if (id === 'gift' && state.shimatsu <= 0) { snd('error'); say('bucho', '始末書もないのに菓子折りを持ってこられてもな……。気持ちだけもらっておく。', { interrupt: true }); return; }
    if (id === 'coffee' && state.minutes <= 0) { snd('error'); say('senpai', 'まだ朝の10時だぞ。コーヒーは後にとっておけ。', { interrupt: true }); return; }
    const c = CASES[state.current], st = state.cases[state.current];
    if ((id === 'review' || id === 'radar') && st.status !== 'open') { snd('error'); say('senpai', 'そのチケットはもう片付いてるぞ。次のチケットで使おう。', { interrupt: true }); return; }
    if (id === 'radar' && st.radar) { snd('error'); say('senpai', 'メモならもう渡したぞ。テーブル定義の★のところだ。', { interrupt: true }); switchTab('schema', true); return; }
    if (id === 'review') {
      const form = $('#answer-form'), choice = form && (form.querySelector('input[name="choice"]:checked') || {}).value, ev = $('#evidence') ? $('#evidence').value.trim() : '';
      if (!choice || !ev) { snd('error'); say('cs', 'ダブルチェックするので、先に調査結論を選んで、根拠も書いておいてください！', { interrupt: true }); return; }
    }
    state.inv[id]--;
    if (id === 'coffee') {
      state.minutes = Math.max(0, state.minutes - 30);
      snd('can'); setTimeout(() => snd('rewind'), 1100);
      if (f) f.floatText($('#clock'), '−30分', 'plus');
      say('senpai', 'コーヒーで一息ついたら、なんだか時間が戻った気がするな。', { interrupt: true });
    } else if (id === 'treat') {
      state.buffs.freeHint++; snd('pop');
      say('senpai', 'お、おにぎり？ ありがとう。次のヒントはタダでいいぞ。', { interrupt: true });
    } else if (id === 'medicine') {
      state.buffs.shield++; snd('pop');
      say('senpai', '胃薬か……。次に差し戻されても、減点なしで済むようにしておく。', { interrupt: true });
    } else if (id === 'gift') {
      state.shimatsu--; snd('pop');
      if (f) f.floatText($('#shimatsu'), '−1枚', 'plus');
      say('bucho', '……ほう、老舗の羊羹か。今回の始末書は、なかったことにしておこう。', { interrupt: true });
    } else if (id === 'energy') {
      state.buffs.energy += 10; snd('can');
      say('senpai', 'エナジードリンク一気飲みか。しばらくは何本SQLを書いても時間が進まないぞ。', { interrupt: true });
    } else if (id === 'radar') {
      st.radar = true; snd('hint');
      const ts = radarTables(c);
      switchTab('schema', true); applyRadar();
      say('senpai', `このチケットなら、見るのは ${ts.map((t) => `<code>${t}</code>`).join('、')} だな。テーブル定義に★を付けておいた。`, { interrupt: true });
    } else if (id === 'review') {
      const form = $('#answer-form'), choice = (form.querySelector('input[name="choice"]:checked') || {}).value, ev = $('#evidence').value;
      st.choice = choice; st.evidence = ev;
      const okC = choice === c.answer, okE = !!DB && checkEvidence(c, ev);
      snd(okC && okE ? 'ok' : 'pop');
      save(); renderHud();
      const fb = $('#feedback');
      fb.hidden = false; fb.className = `feedback is-review${okC && okE ? ' is-ok' : ''}`;
      fb.innerHTML = `<b>ダブルチェックの結果</b>（減点なし）　結論 <span class="${okC ? 'ok' : 'ng'}">${okC ? '○' : '×'}</span>　根拠 <span class="${okE ? 'ok' : 'ng'}">${okE ? '○' : '×'}</span>`;
      fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      say('cs', okC && okE ? 'ダブルチェックしました。結論も根拠もばっちりです、送っちゃいましょう！' : !okC && !okE ? 'うーん……結論も根拠も、ログと合ってない気がします。' : !okC ? '根拠の値は合ってます。でも結論はそれじゃない気がします。' : '結論は同じ意見です。でも根拠に書いた値が違うかも。', { interrupt: true });
      toast(`${it.name}を使いました`, '結果は回答用紙の下に出ています。');
      return;
    }
    save(); renderHud(); renderAnswer();
    toast(`${it.name}を使いました`, it.desc);
  }

  // ---------------------------------------------------------------- 道具（付箋メモ・関係図）と机の飾り
  const TABS = ['schema', 'notes', 'memo', 'erd'];
  function switchTab(name, quiet) {
    TABS.forEach((t) => { const b = $(`#tab-btn-${t}`), p = $(`#tab-${t}`); if (!b || !p) return; b.setAttribute('aria-selected', String(t === name)); p.hidden = t !== name; });
    if (!quiet) lessonEvent({ type: 'tab', tab: name });
  }
  function renderTools() {
    const memoBtn = $('#tab-btn-memo'), erdBtn = $('#tab-btn-erd');
    if (memoBtn) memoBtn.hidden = !owns('memo');
    if (erdBtn) erdBtn.hidden = !owns('erd');
    $('#tab-btn-schema').textContent = owns('memo') && owns('erd') ? 'テーブル' : 'テーブル定義'; // タブが4つになると狭いので短くする
    if (owns('memo')) renderMemo();
    if (owns('erd')) renderErd();
    renderNotes();
    if ((!owns('memo') && memoBtn && memoBtn.getAttribute('aria-selected') === 'true') || (!owns('erd') && erdBtn && erdBtn.getAttribute('aria-selected') === 'true')) switchTab('schema', true);
  }
  function renderMemo() {
    const list = state.snippets || [];
    $('#tab-memo').innerHTML = `<div class="memo">
      <p class="memo-desc">よく使うSQLを5本まで貼っておけます。クリックでエディタに入ります。</p>
      <button class="btn" type="button" id="btn-memo-add" ${list.length >= 5 ? 'disabled' : ''}>${list.length >= 5 ? '付箋はいっぱい（5本まで）' : '今のエディタのSQLを付箋に貼る'}</button>
      <ul class="memo-list">${list.map((sq, k) => `<li class="memo-note n${k % 3}"><button type="button" class="memo-use" data-memo="${k}" title="エディタに入れる"><pre>${esc(sq)}</pre></button><button type="button" class="memo-del" data-memo-del="${k}" title="はがす" aria-label="はがす">×</button></li>`).join('') || '<li class="memo-empty">まだ何も貼っていません。</li>'}</ul>
    </div>`;
  }
  // 関係図：列名と「→ テーブル」の説明から、どのテーブルがどこを参照しているかをまとめる
  const KEYMAP = { user_id: 'usr_users', target_user_id: 'usr_users', character_id: 'usr_characters', world_id: 'mst_worlds', to_world: 'mst_worlds', item_id: 'mst_items', equip_id: 'mst_equips', stage_id: 'mst_stages', event_id: 'mst_events', gacha_id: 'mst_gachas', mission_id: 'mst_missions', product_id: 'mst_products' };
  function renderErd() {
    const names = new Set(TABLE_DOCS.map((t) => t.name));
    const hubs = {};
    TABLE_DOCS.forEach((t) => t.cols.forEach(([col, desc]) => {
      const m = String(desc).match(/→\s*([a-z_]+)/);
      const target = m && names.has(m[1]) ? m[1] : KEYMAP[col];
      if (!target || target === t.name || !names.has(target)) return;
      (hubs[target] = hubs[target] || []).push(`${t.name}.${col}`);
    }));
    const keyOf = (tbl) => (TABLE_DOCS.find((t) => t.name === tbl) || { cols: [['?']] }).cols[0][0];
    const order = Object.keys(hubs).sort((a, b) => hubs[b].length - hubs[a].length);
    $('#tab-erd').innerHTML = `<div class="erd"><p class="memo-desc">矢印の先が参照先のテーブル。JOIN の ON / USING に使う列です。</p>${order.map((h) => `<div class="erd-hub"><p class="erd-head"><b>${h}</b><code>${esc(keyOf(h))}</code></p><ul>${hubs[h].map((r) => `<li><span>←</span>${esc(r)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  }
  // Kさんの調査メモ（消耗品）：模範SQLに出てくるテーブルに★
  const radarTables = (c) => TABLE_DOCS.map((t) => t.name).filter((n) => new RegExp(`\\b${n}\\b`, 'i').test(c.model || ''));
  function applyRadar() {
    const i = state && state.current, on = i != null && state.cases[i] && state.cases[i].radar && state.cases[i].status === 'open';
    const ts = on ? radarTables(CASES[i]) : [];
    document.querySelectorAll('#tab-schema details.tbl').forEach((d) => {
      const hit = ts.includes(d.querySelector('.tbl-name').textContent);
      d.classList.toggle('is-radar', hit);
      if (hit) d.open = true;
    });
  }
  // CS管理画面の権限（道具）：公開ID → user_id
  const uidCache = {};
  function uidOf(pub) {
    if (!DB || !pub) return null;
    if (uidCache[pub] !== undefined) return uidCache[pub];
    let v = null;
    try { const st = DB.prepare('SELECT user_id FROM usr_users WHERE public_id = ?'); st.bind([pub]); if (st.step()) v = st.get()[0]; st.free(); } catch (e) { /* ignore */ }
    return (uidCache[pub] = v);
  }
  // SQLに埋める user_id（分からなければ公開IDからのサブクエリ）
  const uidExpr = (c) => { const u = uidOf(c.user); return u != null ? String(u) : sub(c.user); };
  const recvDate = (c, days) => { const d = shiftDt(`${c.received}:00`, (days || 0) * 1440); return d ? d.slice(0, 10) : '2026-11-13'; };
  // 行動タイムライン（道具）：そのユーザーの log_ テーブルをまとめて時系列に
  function timelineSql(c) {
    const u = uidExpr(c);
    const parts = [
      ['log_login', 'log_id', 'result', "country || ' ' || ip_address"],
      ['log_character', 'log_id', 'action', 'detail'],
      ['log_item', 'log_id', 'action', "(SELECT name FROM mst_items m WHERE m.item_id = l.item_id) || ' x' || quantity"],
      ['log_equip', 'log_id', 'action', "(SELECT name FROM mst_equips m WHERE m.equip_id = l.equip_id) || ' ' || IFNULL(detail, '')"],
      ['log_currency', 'log_id', 'reason', "currency || ' ' || amount || '（残高 ' || balance_after || '）'"],
      ['log_gacha', 'log_id', "'GACHA'", "gacha_id || ' ' || rarity"],
      ['log_stage', 'log_id', 'result', "(SELECT name FROM mst_stages m WHERE m.stage_id = l.stage_id)"],
      ['log_payment', 'payment_id', 'status', "(SELECT name FROM mst_products m WHERE m.product_id = l.product_id) || ' ' || price_jpy || '円'"],
      ['log_error', 'log_id', 'level', 'message'],
    ].map(([t, id, what, detail], k) => `  ${k ? 'UNION ALL ' : ''}SELECT '${t}' AS tbl, ${id} AS id, created_at, ${what} AS what, ${detail} AS detail FROM ${t} l WHERE user_id = ${u}`);
    return `-- 行動タイムライン：${c.user} の受付日まで4日ぶん（id は各テーブルの log_id。log_payment だけ payment_id）\nSELECT * FROM (\n${parts.join('\n')}\n)\nWHERE created_at BETWEEN '${recvDate(c, -3)} 00:00:00' AND '${c.received}:59'\nORDER BY created_at DESC;`;
  }
  // 調査の定石ノート（道具）：いまのチケットのユーザー入りのひな形
  const RECIPES = [
    ['ユーザーを探す', '公開ID → user_id', (c) => `SELECT * FROM usr_users WHERE public_id = '${c.user}';`],
    ['ログを新しい順に読む', 'ORDER BY ... DESC', (c) => `SELECT * FROM log_item\nWHERE user_id = ${uidExpr(c)}\nORDER BY created_at DESC\nLIMIT 50;`],
    ['受付日の前後で絞る', 'BETWEEN', (c) => `SELECT * FROM log_login\nWHERE user_id = ${uidExpr(c)}\n  AND created_at BETWEEN '${recvDate(c, -1)} 00:00:00' AND '${c.received}:59'\nORDER BY created_at;`],
    ['マスターと JOIN して名前を付ける', 'JOIN ... ON', (c) => `SELECT l.log_id, l.created_at, l.action, m.name, l.quantity\nFROM log_item l\nJOIN mst_items m ON m.item_id = l.item_id\nWHERE l.user_id = ${uidExpr(c)}\nORDER BY l.created_at DESC;`],
    ['種類ごとに数える', 'GROUP BY', (c) => `SELECT action, COUNT(*) AS n, MIN(created_at) AS first, MAX(created_at) AS last\nFROM log_item\nWHERE user_id = ${uidExpr(c)}\nGROUP BY action\nORDER BY n DESC;`],
    ['トレード相手を調べる', 'LEFT JOIN usr_users', (c) => `SELECT l.log_id, l.action, l.item_id, l.quantity, u.public_id AS partner, l.created_at\nFROM log_item l\nLEFT JOIN usr_users u ON u.user_id = l.target_user_id\nWHERE l.user_id = ${uidExpr(c)} AND l.action LIKE 'TRADE%'\nORDER BY l.created_at DESC;`],
    ['見慣れないIP・端末を探す', 'GROUP BY 複数列', (c) => `SELECT ip_address, device_id, country, result, COUNT(*) AS n,\n       MIN(created_at) AS first, MAX(created_at) AS last\nFROM log_login\nWHERE user_id = ${uidExpr(c)}\nGROUP BY ip_address, device_id, country, result\nORDER BY last DESC;`],
    ['JSON の中身を取り出す', 'json_extract', (c) => `SELECT log_id, action,\n       json_extract(detail, '$.from') AS from_v,\n       json_extract(detail, '$.to') AS to_v,\n       created_at\nFROM log_equip\nWHERE user_id = ${uidExpr(c)}\nORDER BY created_at DESC;`],
  ];
  // IDたどりルーペ（道具）：列名 → 参照先のテーブルと列
  const DRILL = Object.assign({}, KEYMAP, { drop_item_id: 'mst_items', currency_log_id: 'log_currency' });
  const drillKey = (t, col) => (col === 'target_user_id' ? 'user_id' : col === 'to_world' ? 'world_id' : col === 'drop_item_id' ? 'item_id' : col === 'currency_log_id' ? 'log_id' : (TABLE_DOCS.find((x) => x.name === t) || { cols: [[col]] }).cols[0][0]);
  const sqlLit = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  function insertAndRun(text) {
    insertStatement(text);
    const ta = $('#sql'), end = ta.value.length;
    ta.setSelectionRange(end - text.length, end); // 入れたSQLだけを実行する
    runSql();
    ta.setSelectionRange(end, end);
  }
  function renderDeco() {
    const el = $('#deco'); if (!el || !window.Shop) return;
    el.innerHTML = ['poster', 'plant', 'cat', 'lamp', 'keyboard'].filter(owns).map((id) => `<span class="deco-${id}" title="${esc(SHOP().BY_ID[id].name)}">${SHOP().art(id, 3)}</span>`).join('');
  }
  function applyLooks() {
    document.querySelector('.app').classList.toggle('bezel-black', owns('bezel') && state.bezelOn);
    if (window.Sound && window.Sound.setSong) window.Sound.setSong(state.tape || 'lofi');
  }

  // ---------------------------------------------------------------- 研修の進行
  // 研修ノート：問い合わせ票の上に、いまのステップと例のSQLを出す
  function renderLesson() {
    const el = $('#lesson'); if (!el) return;
    const i = state && state.current;
    if (!inTraining() || i == null || !isTrain(i)) { el.hidden = true; el.innerHTML = ''; applyCoach(null); return; }
    const L = lessonOf(i), st = state.cases[i], cur = Math.min(st.step || 0, L.steps.length);
    const done = st.status !== 'open', step = done ? null : L.steps[cur];
    const f = FXo();
    el.hidden = false;
    el.innerHTML = `
      <div class="lesson-head"><span class="lesson-tag">研修 ${i - WORK + 1}/${CASES.length - WORK}</span><b>${esc(L.title)}</b>
        <button class="lesson-skip" type="button" id="btn-skip-training">研修をスキップ</button></div>
      <ol class="lesson-steps">${L.steps.map((s, k) => `<li class="${done || k < cur ? 'is-done' : k === cur ? 'is-current' : ''}"><i class="lb"></i><span><b>STEP ${k + 1}</b>${esc(s.task)}</span></li>`).join('')}</ol>
      ${step ? `<div class="lesson-body">
        <div class="lesson-say">${f ? `<span class="lesson-face">${f.avatar('senpai')}</span>` : ''}<p>${step.say}</p></div>
        ${step.note ? `<p class="lesson-note">${step.note}</p>` : ''}
        ${step.sql ? `<pre class="model lesson-sql">${highlight(step.sql)}</pre><div class="btn-row"><button class="btn" type="button" id="btn-lesson-sql">例をエディタに書き写す</button></div>` : ''}
      </div>` : `<div class="lesson-body"><p class="lesson-clear">この研修はクリア。下の解説を読んだら［${trainIdx().some((k) => state.cases[k].status === 'open') ? '次の研修へ' : '研修を修了する'}］を押そう。</p></div>`}`;
    applyCoach(step ? step.coach : null);
  }
  // いま触ってほしい場所を点滅させる
  function applyCoach(sel) {
    document.querySelectorAll('.is-coach').forEach((x) => x.classList.remove('is-coach'));
    if (sel) { const t = $(sel); if (t) t.classList.add('is-coach'); }
  }
  // Kさんがいまのステップを説明する
  function lessonSay(i, interrupt) {
    const L = lessonOf(i), st = state.cases[i];
    const step = L.steps[st.step || 0];
    if (step && st.status === 'open') say('senpai', step.say, interrupt ? { interrupt: true } : undefined);
  }
  // SQLの実行・タブの切り替え・解決を受けて、ステップを進める
  function lessonEvent(ev) {
    if (!inTraining() || !isTrain(state.current)) return;
    const i = state.current, L = lessonOf(i), st = state.cases[i];
    const before = st.step || 0;
    if (ev.type === 'solved') st.step = L.steps.length;
    else while ((st.step || 0) < L.steps.length && L.steps[st.step || 0].done(ev)) st.step = (st.step || 0) + 1;
    if (st.step === before) return;
    save(); renderLesson();
    const f = FXo();
    if (ev.type === 'solved') {
      if (f) setTimeout(() => f.cutin('solve', 'LESSON CLEAR', `研修${i - WORK + 1}　${L.title}`), 1250);
      say('senpai', ev.gaveup ? L.outro : `正解。${L.outro}`, { interrupt: true });
      return;
    }
    snd('combo');
    if (f) f.floatText($('#lesson .lesson-tag') || $('#ticket'), 'STEP CLEAR', 'plus');
    lessonSay(i, true);
  }
  // 研修を始める（または続きから）
  function beginTraining(isResume) {
    closeModal();
    snd('start');
    if (window.Sound) window.Sound.playBgm();
    const i = state.current;
    renderLesson();
    if (isResume) {
      say('senpai', 'おかえり。研修の続きをやろう。');
      if (state.cases[i].status === 'open' && !state.cases[i].seen) arrive(i); else lessonSay(i);
      return;
    }
    const f = FXo();
    if (f) f.cutin('day', '研修', `DAY 1 の前に ${CASES.length - WORK}件　点数はつきません`);
    snd('boot');
    say('senpai', `ようこそ運用チームへ。教育係のKだ。DAY 1 の前に、簡単な問い合わせを${CASES.length - WORK}件、一緒に解いてみよう。研修中は点数も時計も動かないし、間違えても減点なし。気楽にな。`);
    setTimeout(() => { if (inTraining() && state.current === i) { arrive(i); $('#sql').focus({ preventScroll: true }); } }, f && !f.reduced() ? 1600 : 0);
  }
  // 研修の修了証
  function showTrainingEnd() {
    const f = FXo();
    if (f) f.closeSay();
    applyCoach(null);
    snd('final');
    const n = CASES.length - WORK;
    openModal(`
      <p class="eyebrow">TRAINING COMPLETE</p>
      <div class="cert">
        <p class="cert-title">研 修 修 了 証</p>
        <p>あなたは運用チームの研修（${n}件）を修了したことを、ここに証します。</p>
        <ul class="cert-list">
          <li>公開ID → <code>user_id</code> を引いてから、各テーブルを調べる</li>
          <li><code>WHERE</code> で絞る、<code>ORDER BY created_at</code> で時系列に並べる</li>
          <li><code>log_</code> はログ、<code>mst_</code> はマスター。<code>JOIN</code> で名前を付ける</li>
          <li>条件は <code>AND</code> でつなぐ。日付は <code>date(created_at)</code></li>
          <li>結果のセルをダブルクリックすると、根拠の欄に入る</li>
          <li>ユーザーの言い分とログが食い違ったら、ログを信じる</li>
        </ul>
        <p class="cert-sign">2026年11月13日　運用チーム 教育係 K<span class="cert-stamp">修了</span></p>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" type="button" data-act="end-training">${workBegun() ? '業務に戻る' : 'DAY 1 へ出社する'}</button>
        <button class="btn" type="button" data-act="review">研修のチケットを見直す</button>
      </div>`, 'final');
    if (f) setTimeout(() => { snd('rank'); f.burstFrom($('.cert-stamp') || $('#modal'), { count: 40 }); }, 400);
  }
  // 研修を終えて（またはスキップして）本番へ
  function endTraining(completed) {
    if (FXo()) FXo().closeSay();
    if (completed && !state.trainPaid && window.Shop) {
      state.trainPaid = true; state.wallet += PAY.firstPay; state.earned += PAY.firstPay;
      setTimeout(() => { snd('coins'); toast('初任給が出ました', `研修修了の手当として ${yen(PAY.firstPay)}。右上の［購買部］で調査ツールや消耗品が買えます。`); }, 1800);
    }
    if (completed) state.trainDone = true;
    state.drafts[state.current] = $('#sql').value;
    state.phase = 'work';
    const back = workBegun();
    state.current = back && state.workCurrent != null ? state.workCurrent : firstOpen();
    state.workCurrent = null;
    save(); closeModal(); applyCoach(null);
    $('#results').dataset.used = ''; renderAll();
    beginDay(back);
  }
  // 本番の途中からでも、研修だけやり直せる（本番の進み具合はそのまま）
  function replayTraining() {
    if (!inTraining()) state.workCurrent = state.current;
    state.drafts[state.current] = $('#sql').value;
    trainIdx().forEach((k) => { state.cases[k] = freshCase(); delete state.drafts[k]; });
    state.phase = 'training'; state.current = WORK;
    save();
    $('#results').dataset.used = ''; renderAll();
    beginTraining(false);
  }
  let skipArmed = false;

  // ---------------------------------------------------------------- answer flow
  function checkEvidence(c, v) {
    if (c.evidence.accept) return c.evidence.accept(v);
    const n = parseInt(norm(v).replace(/^LOG_?ID[:=]?/, ''), 10);
    return Number.isFinite(n) && n === KEYS[c.evidence.key];
  }
  function onSubmit(e) {
    e.preventDefault();
    const i = state.current, c = CASES[i], st = state.cases[i];
    const form = $('#answer-form');
    const choice = (form.querySelector('input[name="choice"]:checked') || {}).value;
    const ev = $('#evidence').value;
    st.choice = choice || null; st.evidence = ev;
    const fb = $('#feedback');
    if (!choice || !ev.trim()) {
      snd('pop');
      fb.hidden = false; fb.className = 'feedback is-info';
      fb.textContent = !choice ? '調査結論を選んでください。' : '根拠を入力してください。ログを見て、決め手になった値を書きます。';
      return;
    }
    if (!DB) { fb.hidden = false; fb.className = 'feedback is-info'; fb.textContent = 'DBの準備中です。少し待ってから送信してください。'; return; }
    const forced = debugForce; debugForce = false;
    const okC = forced || choice === c.answer, okE = forced || checkEvidence(c, ev), tr = isTrain(i);
    if (okC && okE) {
      st.status = 'solved';
      const perfect = st.wrong === 0 && st.hints === 0;
      if (tr) { st.score = 0; st.bonus = 0; } else {
        st.score = Math.max(FLOOR, BASE - (st.wrong - (st.shielded || 0)) * WRONG - (st.hints - (st.freeHints || 0)) * HINT);
        state.combo = perfect ? state.combo + 1 : 0;
        state.maxCombo = Math.max(state.maxCombo || 0, state.combo);
        st.bonus = perfect && state.combo >= 2 ? comboBonus(state.combo) : 0;
      }
      advance('solve');
      save();
      snd('solved');
      renderHud(); renderTicket(); renderAnswer();
      const s = $('#ticket .stamp'); if (s) s.classList.add('slam');
      $('#ticket-scroll').scrollTop = 0;
      const f = FXo();
      if (tr) { if (f) f.evidence(evidenceCardHtml(c, ev)); lessonEvent({ type: 'solved' }); return; }
      if (f) {
        const pts = st.score + st.bonus;
        // まず決め手のログを叩きつけてから、CASE CLOSED
        f.evidence(evidenceCardHtml(c, ev));
        setTimeout(() => {
          f.cutin('solve', perfect ? 'PERFECT!' : 'CASE CLOSED', `解決　+${pts}`);
          f.burstFrom($('#ticket .stamp') || $('#ticket'));
          f.floatText($('#score'), `+${pts}`, 'plus');
        }, 1250);
        if (st.bonus) setTimeout(() => { snd('combo'); f.cutin('combo', `${state.combo} COMBO`, `ボーナス +${st.bonus}`); }, 2750);
        const line = PRAISE[Math.floor(Math.random() * PRAISE.length)];
        say('senpai', `${line}${state.combo >= 2 ? `ノーミス${state.combo}連続だ。` : ''}ユーザーからも返信が来てるぞ。`, { interrupt: true });
      }
      return;
    }
    st.wrong++;
    const shielded = !tr && state.buffs.shield > 0;
    if (shielded) { state.buffs.shield--; st.shielded = (st.shielded || 0) + 1; }
    if (state.combo && !tr) state.combo = 0;
    advance('wrong');
    save(); renderHud(); renderTicket();
    snd('reject');
    const line = !okC && !okE ? '結論も根拠も、もう一度ログを見直してみて。'
      : !okC ? '根拠に挙げた値は合ってる。でも、そこから言える結論は別じゃない？'
        : '結論はいい線。でも根拠の値が違う。どのログが決め手？';
    fb.hidden = false; fb.className = 'feedback';
    fb.textContent = `差し戻されました（${tr ? '研修中なので減点なし' : shielded ? '胃薬が効いて減点なし' : `−${WRONG}点`}）。先輩「${line}」`;
    fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = $('#ticket');
    t.querySelectorAll('.stamp.is-reject').forEach((x) => x.remove());
    t.insertAdjacentHTML('beforeend', stampHtml('差戻', 'is-reject fade'));
    const f = FXo();
    if (f) { f.flash('red'); f.shake(t, true); f.cutin('reject', '差し戻し', tr ? '研修中なので減点なし' : shielded ? '胃薬が効いた　減点なし' : `−${WRONG}点　ユーザーの怒りが上がった`); say('senpai', line, { interrupt: true }); }
    else { t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); }
  }
  function showHint() {
    const i = state.current, c = CASES[i], st = state.cases[i];
    if (st.hints >= c.hints.length) return;
    st.hints++;
    if (!isTrain(i) && state.buffs.freeHint > 0) { state.buffs.freeHint--; st.freeHints = (st.freeHints || 0) + 1; }
    advance('hint'); save(); renderHud();
    snd('hint');
    $('#hints').insertAdjacentHTML('beforeend', `<li><b>${st.hints}</b>${c.hints[st.hints - 1]}</li>`);
    if (st.hints >= c.hints.length) $('#btn-hint').disabled = true;
    else $('#btn-hint').textContent = `ヒントを見る（${isTrain(i) ? '研修中は減点なし' : state.buffs.freeHint > 0 ? 'おごり済み：減点なし' : `−${HINT}`}）`;
    say('senpai', c.hints[st.hints - 1], { interrupt: true });
  }
  let giveupArmed = false;
  function giveUp(btn) {
    if (!giveupArmed) { giveupArmed = true; btn.textContent = isTrain(state.current) ? '本当に聞く？（答えと解説が出ます）' : '本当に聞く？（このチケットは0点）'; btn.classList.add('btn-danger'); snd('pop'); return; }
    giveupArmed = false;
    const st = state.cases[state.current], tr = isTrain(state.current);
    st.status = 'gaveup'; st.score = 0; st.bonus = 0; if (!tr) state.combo = 0; advance('giveup'); save();
    snd('giveup');
    renderHud(); renderTicket(); renderAnswer();
    const s = $('#ticket .stamp'); if (s) s.classList.add('slam');
    say('senpai', 'しょうがない、一緒に見ようか。解説と模範SQLを置いておくから、手を動かして確かめてみて。', { interrupt: true });
    if (tr) lessonEvent({ type: 'solved', gaveup: true });
  }
  // 新しいチケットが届いたときの演出（電話 → 印字 → CS担当のひとこと）
  function arrive(i) {
    const st = state.cases[i], c = CASES[i];
    st.seen = true; save();
    snd('ring');
    setTimeout(() => snd('print'), 520);
    renderTicket(true);
    renderHud();
    const f = FXo();
    if (f) {
      f.cutin('incoming', isTrain(i) ? 'TRAINING TICKET' : 'INCOMING TICKET', `${slotLabel(i)}　${c.label}　${c.category}`);
      const greet = isTrain(i) ? (i === WORK ? '研修用のチケットを用意しました！' : '研修の次のチケットです！') : posOf(i) === 0 ? ARRIVE[0] : ARRIVE[1 + Math.floor(Math.random() * (ARRIVE.length - 1))];
      say('cs', `${greet}「${esc(c.label)}」の件、${esc(c.note)}`);
      if (isTrain(i)) lessonSay(i);
      if (c.backdoor) say('senpai', '補填の管理ツール、今日もめちゃくちゃ重いんだよな……。本番に直接 <code>UPDATE</code> したくなるけど、絶対にやるなよ。絶対だぞ。');
    }
  }
  function goto(i, opts) {
    if (i === state.current && !(opts && opts.force)) return;
    state.drafts[state.current] = $('#sql').value;
    state.current = i; giveupArmed = false; specArmed = false; save();
    snd('page');
    renderHud(); renderTicket(); renderAnswer(); renderLesson();
    const draft = state.drafts[i];
    setEditor(draft != null ? draft : starterFor(i));
    $('#ticket-scroll').scrollTop = 0;
    if (state.cases[i].status === 'open' && !state.cases[i].seen) arrive(i);
  }
  function next() {
    if (inTraining()) {
      const k = trainIdx().find((x) => state.cases[x].status === 'open');
      if (k == null) showTrainingEnd(); else goto(k);
      return;
    }
    if (allDone()) showFinal(true);
    else if (dayDone()) showDayEnd(true);
    else goto(firstOpen());
  }

  // ---------------------------------------------------------------- modals
  function openModal(html, kind) {
    const ov = $('#overlay');
    ov.className = 'overlay' + (kind ? ` is-${kind}` : '');
    $('#modal').innerHTML = html; ov.hidden = false;
    const b = $('#modal .btn-primary') || $('#modal button'); if (b) b.focus({ preventScroll: true });
  }
  function closeModal() { $('#overlay').hidden = true; finalTimers.forEach(clearTimeout); finalTimers = []; }
  function showIntro() {
    const resume = state && state.started && !allDone();
    const hasTrain = CASES.length > WORK, trainNo = inTraining() ? trainIdx().indexOf(firstOpen()) + 1 : 0;
    const f = FXo();
    const sky = f ? f.skyline() : '';
    const cast = f ? ['senpai', 'cs', 'infra', 'bucho'].map((k) => `<figure class="cast-${k}">${f.avatar(k)}<figcaption>${esc(f.PEOPLE[k].name)}<small>${esc(f.PEOPLE[k].role)}</small></figcaption></figure>`).join('') : '';
    openModal(`
      <div class="title-sky" aria-hidden="true">${sky}</div>
      <div class="title-inner">
        <p class="eyebrow">NOCT GAMES / OPS TEAM / DAY 1</p>
        <h1 class="logo"><span class="logo-ja" data-text="ログは嘘をつかない">ログは嘘をつかない</span><span class="cursor"></span></h1>
        <p class="logo-en">LOGS DON'T LIE</p>
        <p class="logo-sub">サーバーエンジニア問い合わせ対応シミュレーター</p>
        <div class="title-card">
          <div class="cast">${cast}</div>
          <p class="story">運営中のMMORPG『クロノリア・オンライン』。今日もCSチームから「キャラが消えた」「課金が反映されない」と調査依頼が飛んでくる。本番DBにSQLを投げ、ログから真実を暴け。<b>ユーザーの言い分が正しいとは限らない。</b></p>
          <dl class="rules">
            <dt>任務</dt><dd>1日に5件届くチケットを調査し、結論と決め手の値（ログIDなど）で回答。全${DAYS()}日・${WORK}件。日を追うごとに手強くなる</dd>
            <dt>得点</dt><dd>1件 ${BASE} 点。差し戻し −${WRONG}、ヒント −${HINT}。ノーミスで連続解決するとコンボボーナス（最大 +${COMBO * COMBO_CAP}）</dd>
            <dt>禁止</dt><dd>更新系のSQL。流すと部長が飛んでくる（始末書 −${SHIMATSU}）</dd>
            <dt>時計</dt><dd>毎朝 10:00 出社。調べるほど時間が進む。定時は 18:00</dd>
            ${hasTrain ? `<dt>研修</dt><dd>はじめての人は、DAY 1 の前に研修（${CASES.length - WORK}件）。Kさんと一緒に調べ方を覚える。点数はつかない。経験者はスキップできる</dd>` : ''}
            ${window.Shop ? '<dt>給料</dt><dd>1日の終わりに給料が出る。右上の［購買部］で、調べものを楽にする調査ツールや消耗品をいつでも買える</dd>' : ''}
            <dt>音</dt><dd>BGMと効果音あり。右上の BGM / SE で切り替え</dd>
          </dl>
          <div class="btn-row title-actions">
            ${!DB ? '<button class="btn btn-primary btn-start" type="button" disabled>データベースを準備中…</button>'
              : resume && inTraining() ? `<button class="btn btn-primary btn-start" type="button" data-act="resume">▶ 研修の続きから（研修${trainNo}）</button><button class="btn" type="button" data-act="skip-training">研修をスキップして出社する</button><button class="btn btn-ghost" type="button" data-act="reset">最初からやり直す</button>`
              : resume ? `<button class="btn btn-primary btn-start" type="button" data-act="resume">▶ 続きから（DAY ${state.day}・#${posOf(firstOpen()) + 1}）</button>${hasTrain ? '<button class="btn" type="button" data-act="replay-training">研修を受け直す</button>' : ''}<button class="btn btn-ghost" type="button" data-act="reset">最初からやり直す</button>`
              : hasTrain ? '<button class="btn btn-primary btn-start" type="button" data-act="start-training">▶ 研修から始める（はじめての人）</button><button class="btn" type="button" data-act="start">研修をスキップして出社する（経験者）</button>'
                : '<button class="btn btn-primary btn-start" type="button" data-act="start">▶ 出社する</button>'}
          </div>
        </div>
      </div>`, 'title');
  }
  function beginDay(isResume) {
    closeModal();
    snd('start');
    if (window.Sound) window.Sound.playBgm();
    if (isResume) {
      const i = state.current;
      if (dayDone()) say('senpai', 'おかえり。今日の分は終わってるぞ。上のバーから業務を締めよう。');
      else if (state.cases[i].status === 'open' && !state.cases[i].seen) { say('senpai', 'おかえり。続きをやろう。'); arrive(i); }
      else say('senpai', 'おかえり。続きをやろう。チケットは上のバーから選べるぞ。');
      $('#sql').focus({ preventScroll: true });
      return;
    }
    const f = FXo();
    if (!f) { startDay(); return; }
    const open = workSt().filter((c) => c.status === 'open').length;
    f.boot([
      'NOCT GAMES  ops-terminal v2.6',
      '> login ops-team ............ OK',
      '> connect prod-replica-01 (READ ONLY) ... OK',
      "> SELECT COUNT(*) FROM tickets WHERE status = 'OPEN';",
      `  ${open}`,
      `> DAY ${state.day} の業務を開始します（本日分 ${DAY_SIZE} 件）`,
    ], startDay);
  }
  // 1日の始まり：DAY n のカットイン → 先輩のあいさつ → 1件目が届く
  function startDay() {
    const d = state.day, f = FXo();
    const tiers = dayCases(d).map((i) => CASES[i].tier);
    const prevTiers = d > 1 ? dayCases(d - 1).map((i) => CASES[i].tier) : [1];
    let line = d === 1 && state.trainDone ? `研修おつかれ。ここからが本番だ。問い合わせは毎日${DAY_SIZE}件ずつ届く。研修でやった手順で、ひとつずつ片付けていこう。`
      : d === 1 ? `おはよう。配属初日だな。問い合わせは毎日${DAY_SIZE}件ずつ、届いた順にさばいていこう。DBは参照専用、更新系のSQLは絶対に流すなよ。`
      : d === DAYS() ? '今日で最終日だ。最後まで気を抜くなよ。'
        : Math.max(...tiers) > Math.max(...prevTiers) ? (Math.max(...tiers) === 3 ? 'おはよう。そろそろ一人前だな。今日からは手強いのが混ざるぞ。' : 'おはよう。今日からは、少し調べる量が多いチケットも回ってくる。')
          : DAY_LINES[d % DAY_LINES.length];
    if (f) f.cutin('day', `DAY ${d}`, `本日の問い合わせ ${DAY_SIZE}件`);
    snd('boot');
    say('senpai', line);
    setTimeout(() => { arrive(state.current); $('#sql').focus({ preventScroll: true }); }, f && !f.reduced() ? 1600 : 0);
  }
  // 翌日へ：時計を 10:00 に戻し、次の5件を届ける
  function goNextDay() {
    if (state.day >= DAYS()) { showFinal(true); return; }
    state.drafts[state.current] = $('#sql').value;
    state.day += 1; state.minutes = 0; state.current = dayCases(state.day)[0];
    state.shimatsuAtStart = state.shimatsu; state.enjoAtStart = state.enjo || 0;
    save(); closeModal();
    $('#results').dataset.used = ''; renderAll();
    snd('start');
    startDay();
  }
  const gradeOf = (score) => GRADES.find((g) => score >= g[0]);
  const resultLabel = (s) => (s.status === 'solved' ? (s.via === 'spec' ? '仕様です' : s.via === 'update' ? '裏ルート' : s.wrong === 0 && s.hints === 0 ? 'PERFECT' : '解決') : s.status === 'gaveup' ? '先輩に聞いた' : '未対応');
  // 1日の終わり：その日の5件を1行ずつ判を押して見せ、評価（S〜C）を出す
  function showDayEnd(animate) {
    const f = FXo();
    if (f) f.closeSay();
    const d = state.day, score = dayScore(d), [, grade, gline] = gradeOf(score);
    if (!state.dayLog[d]) { state.dayLog[d] = { score, minutes: state.minutes }; save(); }
    const pay = paySalary(d);
    if (animate) snd('final');
    const perfect = dayCases(d).filter((i) => resultLabel(state.cases[i]) === 'PERFECT').length;
    const rows = dayCases(d).map((i, p) => {
      const c = CASES[i], s = state.cases[i];
      return `<tr class="reveal-row"><td>#${p + 1} ${esc(c.label)}</td><td class="${s.status === 'solved' ? 'ok' : 'ng'}">${resultLabel(s)}</td><td class="r">${s.wrong}</td><td class="r">${s.hints}</td><td class="r">${s.queries}</td><td class="r">${s.score + (s.bonus || 0)}</td></tr>`;
    }).join('');
    const last = d >= DAYS();
    openModal(`
      <p class="eyebrow">DAY ${d} / ${DAYS()}　本日の業務終了　退勤 ${clockText()}</p>
      <div class="final-score"><b id="final-score">${animate ? 0 : score}</b><span>/ ${DAY_SIZE * BASE} 点　累計 ${totalScore()} 点</span></div>
      <div class="badges"><span class="badge ${DAY_START + state.minutes <= DAY_END ? 'is-good' : 'is-bad'}">${overtimeText()}</span><span class="badge ${perfect === DAY_SIZE ? 'is-good' : ''}">PERFECT ${perfect} / ${DAY_SIZE}</span>${state.combo >= 2 ? `<span class="badge is-good">${state.combo} COMBO 継続中</span>` : ''}<span class="badge">残り ${workSt().filter((c) => c.status === 'open').length} 件</span></div>
      <table class="summary"><thead><tr><th>チケット</th><th>結果</th><th class="r">差戻</th><th class="r">ヒント</th><th class="r">SQL</th><th class="r">点</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="final-rank" id="final-rank">
        <div class="rank-stamp"><span>${grade}</span></div>
        <div><p class="final-title">本日の評価 ${grade}</p><p class="final-line">Kさん「${esc(gline)}」</p></div>
      </div>
      ${payslipHtml(d, pay)}
      <div class="btn-row">
        <button class="btn btn-primary" type="button" data-act="${last ? 'show-final' : 'next-day'}">${last ? '最終結果を見る' : `翌日へ（DAY ${d + 1}）`}</button>
        ${window.Shop ? `<button class="btn btn-shop" type="button" data-act="shop">${FXo() ? FXo().icon('shop', 2) : ''}購買部に寄る${newStock() ? '<em class="shop-btn-new">NEW</em>' : ''}</button>` : ''}
        <button class="btn" type="button" data-act="review">今日のチケットを見直す</button>
      </div>
      ${(state.shimatsuIssued || 0) >= 3 ? '<div class="btn-row"><button class="btn btn-resign" type="button" data-act="resign">辞表を叩きつけて定時退社する</button></div>' : ''}`, 'final');
    reveal(animate, score, 'grade');
  }
  // 結果画面の演出：1行ずつ判を押す → 点数のカウントアップ → 称号・評価の印鑑
  function reveal(animate, score) {
    const f = FXo(), modal = $('#modal');
    if (!animate || !f || f.reduced()) { modal.classList.add('revealed'); return; }
    modal.classList.add('revealing');
    const rowsEl = [...modal.querySelectorAll('.reveal-row')];
    let t = 600;
    rowsEl.forEach((r) => { finalTimers.push(setTimeout(() => { r.classList.add('is-in'); snd('reveal'); }, t)); t += rowsEl.length > 10 ? 120 : 300; });
    finalTimers.push(setTimeout(() => f.countUp($('#final-score'), 0, score, 1300), t));
    t += 1500;
    finalTimers.push(setTimeout(() => {
      modal.classList.add('revealed'); modal.classList.remove('revealing');
      snd('rank'); f.burstFrom($('.rank-stamp'), { count: 50 });
    }, t));
    modal.addEventListener('click', (e) => {
      if (!modal.classList.contains('revealing') || e.target.closest('button')) return;
      finalTimers.forEach(clearTimeout); finalTimers = [];
      rowsEl.forEach((r) => r.classList.add('is-in'));
      $('#final-score').textContent = score;
      modal.classList.add('revealed'); modal.classList.remove('revealing');
    });
  }

  function rankOf(score) { return RANKS.find((r) => score >= r[0] * MAX_SCORE); }
  function overtimeText(minutes) {
    const end = Math.floor(DAY_START + (minutes == null ? state.minutes : minutes));
    if (end <= DAY_END) return '定時退社';
    const over = end - DAY_END;
    return `残業 ${Math.floor(over / 60)}時間${over % 60}分`;
  }
  let finalTimers = [];
  function showFinal(animate) {
    const f = FXo();
    if (f) f.closeSay();
    if (animate) snd('final');
    const score = totalScore(); const [, title, line] = rankOf(score);
    const solved = workSt().filter((c) => c.status === 'solved').length;
    if (!state.dayLog[state.day] && dayDone()) { state.dayLog[state.day] = { score: dayScore(state.day), minutes: state.minutes }; save(); }
    if (dayDone()) paySalary(state.day); // 最終日は1日の結果画面を通らないので、ここで給料を出す
    const ontime = Object.values(state.dayLog).filter((x) => DAY_START + x.minutes <= DAY_END).length;
    // 20日分を1行ずつ
    const rows = Array.from({ length: DAYS() }, (_, k) => {
      const d = k + 1, ids = dayCases(d), log = state.dayLog[d];
      const ok = ids.filter((i) => state.cases[i].status === 'solved').length;
      const perfect = ids.filter((i) => resultLabel(state.cases[i]) === 'PERFECT').length;
      const sc = dayScore(d);
      return `<tr class="reveal-row"><td>DAY ${d}</td><td class="${ok === ids.length ? 'ok' : 'ng'}">${ok}/${ids.length} 解決</td><td class="r">${perfect}</td><td class="r">${log ? clockText(-state.minutes + log.minutes) : '-'}</td><td class="r">${gradeOf(sc)[1]}</td><td class="r">${sc}</td></tr>`;
    }).join('');
    openModal(`
      <p class="eyebrow">全${DAYS()}日の業務終了　${WORK}件</p>
      <div class="final-score"><b id="final-score">${animate ? 0 : score}</b><span>/ ${MAX_SCORE} 点　${solved}件解決</span></div>
      <div class="badges"><span class="badge ${ontime === DAYS() ? 'is-good' : ''}">定時退社 ${ontime} / ${DAYS()}日</span><span class="badge">最大コンボ ${state.maxCombo || 0}</span><span class="badge ${state.shimatsu ? 'is-bad' : 'is-good'}">始末書 ${state.shimatsu}枚</span>${state.thrown ? `<span class="badge">ゴミ箱に捨てた始末書 ${state.thrown}枚</span>` : ''}${state.enjo ? `<span class="badge is-bad">炎上 ${state.enjo}回</span>` : ''}${state.dropUsed ? '<span class="badge">DROPした（夢）</span>' : ''}${window.Shop ? `<span class="badge is-good">生涯年収 ${yen(state.earned)}</span><span class="badge">使った額 ${yen(state.spent)}</span>${spenderName() ? `<span class="badge">呼び名「${spenderName()}」</span>` : ''}` : ''}${workSt().some((c) => c.banned) ? '<span class="badge is-good">BAN執行</span>' : ''}</div>
      <div class="summary-wrap"><table class="summary"><thead><tr><th>日</th><th>結果</th><th class="r">PERFECT</th><th class="r">退勤</th><th class="r">評価</th><th class="r">点</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">始末書 ${state.shimatsu} 枚（−${state.shimatsu * SHIMATSU}）${state.penalty ? `　炎上（−${state.penalty}）` : ''}</td><td class="r"></td></tr></tfoot></table></div>
      <div class="final-rank" id="final-rank">
        <div class="rank-stamp"><span>称号</span></div>
        <div><p class="final-title">${esc(title)}${state.shimatsu >= 3 ? '（始末書の常連）' : ''}</p><p class="final-line">${esc(line)}</p></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" type="button" data-act="copy">結果をコピー</button>
        <button class="btn" type="button" data-act="review">チケットを見直す</button>
        <button class="btn btn-ghost" type="button" data-act="reset">最初から遊ぶ</button>
      </div>
      ${(state.shimatsuIssued || 0) >= 3 ? '<div class="btn-row"><button class="btn btn-resign" type="button" data-act="resign">辞表を叩きつけて定時退社する</button></div>' : ''}`, 'final');
    reveal(animate, score);
  }
  // 隠しエンディング：始末書を3枚以上もらうと、辞表を叩きつけて退職できる
  function showResign() {
    const f = FXo();
    if (f) f.closeSay();
    snd('smash');
    openModal(`
      <div class="title-sky" aria-hidden="true">${f ? f.skyline() : ''}</div>
      <div class="title-inner resign">
        <div class="resign-letter"><span>辞</span><span>表</span></div>
        <p class="eyebrow">ENDING : RESIGNED</p>
        <h1 class="logo"><span class="logo-ja" data-text="自由の身">自由の身</span></h1>
        <div class="title-card">
          <p>あなたは部長の机に辞表を叩きつけ、17:59 にオフィスを出た。夕焼けがやけにきれいだ。</p>
          <p>翌朝、CSチームのUさんから「チケット、まだ来てますよ」とだけ連絡が来た。返信はしなかった。</p>
          <dl class="rules"><dt>始末書</dt><dd>もらった枚数 ${state.shimatsuIssued || 0} 枚</dd><dt>称号</dt><dd>退職エンド「自由の身」</dd><dt>スコア</dt><dd>${totalScore()} / ${MAX_SCORE} 点</dd></dl>
          <p class="resign-note">※現実では、辞表を叩きつける前に、まず有給を使い切りましょう。</p>
          <div class="btn-row title-actions">
            <button class="btn btn-primary" type="button" data-act="back-final">結果画面に戻る</button>
            <button class="btn" type="button" data-act="reset">再就職する（最初から）</button>
          </div>
        </div>
      </div>`, 'title');
    if (f) setTimeout(() => { f.shake($('.app'), true); snd('rank'); }, 350);
  }
  function resultText() {
    const score = totalScore(); const [, title] = rankOf(score);
    const perfect = workSt().filter((c) => resultLabel(c) === 'PERFECT').length;
    const grades = Array.from({ length: DAYS() }, (_, k) => gradeOf(dayScore(k + 1))[1]).join('');
    return `『ログは嘘をつかない』 ${score}/${MAX_SCORE}点 ${WORK}件中PERFECT ${perfect}件 毎日の評価 ${grades} 称号「${title}」 最大${state.maxCombo || 0}コンボ 始末書${state.shimatsu}枚${window.Shop ? ` 生涯年収${Math.round(state.earned)}G${spenderName() ? `（${spenderName()}）` : ''}` : ''}`;
  }

  // ---------------------------------------------------------------- toast
  function toast(title, body, bad) {
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' is-bad' : '');
    el.innerHTML = `<b>${esc(title)}</b>${esc(body)}`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  // ---------------------------------------------------------------- events
  // ---------------------------------------------------------------- デバッグモード（動作確認用）
  // SQLエディタで「:debug」と書いて実行（Ctrl+Enter）すると、画面左下にデバッグパネルが出る。もう一度実行すると消える。
  // URL に ?debug を付けて開いても入る。オン／オフはセーブデータとは別に localStorage に残る。
  const DEBUG_KEY = 'logs-dont-lie:debug';
  let debugOn = false, debugForce = false, debugOpen = true;
  try { debugOn = localStorage.getItem(DEBUG_KEY) === '1' || /[?&]debug\b/.test(location.search); } catch (e) { /* storage unavailable */ }
  function debugCommand(src) {
    const m = stripComments(src).trim().match(/^[:\\]debug(?:\s+(on|off))?\s*;?$/i);
    if (!m) return false;
    setDebug(m[1] ? m[1].toLowerCase() === 'on' : !debugOn);
    return true;
  }
  function setDebug(on) {
    debugOn = on;
    try { if (on) localStorage.setItem(DEBUG_KEY, '1'); else localStorage.removeItem(DEBUG_KEY); } catch (e) { /* storage unavailable */ }
    snd('pop');
    toast(on ? 'DEBUG MODE ON' : 'DEBUG MODE OFF', on ? '左下のパネルから所持金や進行を操作できます。:debug をもう一度実行すると終了。' : 'デバッグパネルを閉じました。');
    renderDebug();
  }
  // いまのチケットの正解の根拠（分かるものだけ）
  const evidenceOf = (c) => { const e = c.evidence || {}; const v = e.value != null ? e.value : e.id != null ? e.id : e.key ? KEYS[e.key] : null; return v == null ? '' : String(v); };
  function renderDebug() {
    const el = $('#debug'); if (!el) return;
    if (!debugOn || !state) { el.hidden = true; el.innerHTML = ''; return; }
    const i = state.current, c = CASES[i], st = state.cases[i], open = st.status === 'open';
    const ans = (c.options.find((o) => o[0] === c.answer) || [])[1] || '';
    const btn = (act, label, dis) => `<button type="button" data-dbg="${act}" ${dis ? 'disabled' : ''}>${label}</button>`;
    el.hidden = false;
    el.innerHTML = `<div class="debug-head"><b>DEBUG</b><span>DAY ${state.day}${inTraining() ? '（研修）' : ''}・${esc(slotLabel(i))}・${clockText()}</span>
        <button type="button" data-dbg="fold" aria-label="${debugOpen ? 'たたむ' : 'ひらく'}">${debugOpen ? '−' : '+'}</button><button type="button" data-dbg="off" aria-label="デバッグモードを終了">×</button></div>
      ${debugOpen ? `<div class="debug-body">
        <p class="debug-label">所持金 ${yen(state.wallet)}</p>
        <div class="debug-row">${btn('money:1000', '+1,000')}${btn('money:10000', '+10,000')}${btn('money:0', '0 にする')}</div>
        <p class="debug-label">チケット ${esc(c.label)}（${open ? '未解決' : st.status === 'solved' ? '解決済み' : '先輩に聞いた'}）</p>
        <div class="debug-row">${btn('solve', '強制成功', !open)}${btn('reject', '強制差し戻し', !open)}${btn('reopen', '未解決に戻す', open)}</div>
        <p class="debug-answer">正解：${esc(ans)}<br>根拠：<code>${esc(evidenceOf(c) || '（受け付け条件のみ）')}</code></p>
        <div class="debug-row">${btn('fill', '正解を入力欄に入れる', !open)}${btn('model', '模範SQLを実行')}</div>
        <p class="debug-label">進行</p>
        <div class="debug-row">${btn('solve-day', '今日の残りを全部解決', inTraining())}${btn('end-day', '今日を締める', inTraining())}</div>
        <div class="debug-row"><label>DAY <input type="number" id="dbg-day" min="1" max="${DAYS()}" value="${Math.min(DAYS(), state.day + 1)}"></label>${btn('jump', 'へジャンプ（前の日は全部解決）')}</div>
        <p class="debug-label">購買部</p>
        <div class="debug-row">${btn('own-all', '全道具を持つ')}${btn('own-none', '道具・飾りを手放す')}${btn('fill-inv', '消耗品を満タン')}${btn('new-stock', '入荷通知をリセット')}</div>
        <p class="debug-label">時計・ペナルティ</p>
        <div class="debug-row">${btn('clock:0', '10:00 に戻す')}${btn('clock:+120', '+2時間')}${btn('clock:end', '18:30 にする')}</div>
        <div class="debug-row">${btn('shimatsu:+1', '始末書 +1')}${btn('shimatsu:0', '始末書 0')}${btn('combo:+1', 'コンボ +1')}</div>
      </div>` : ''}`;
  }
  // 前の日を飛ばすとき・今日をまとめて片付けるときの「解決扱い」
  const debugSolve = (k) => { const s = state.cases[k]; if (s.status === 'open') Object.assign(s, { status: 'solved', score: BASE, bonus: 0, seen: true }); };
  function debugAction(act) {
    const [cmd, arg] = act.split(':');
    const i = state.current, c = CASES[i], st = state.cases[i];
    const refresh = () => { save(); renderAll(); renderDebug(); };
    if (cmd === 'off') { setDebug(false); return; }
    if (cmd === 'fold') { debugOpen = !debugOpen; renderDebug(); return; }
    if (cmd === 'money') { if (arg === '0') state.wallet = 0; else { state.wallet += +arg; state.earned += +arg; } snd('coins'); refresh(); return; }
    if (cmd === 'fill' || cmd === 'solve') {
      if (st.status !== 'open') return;
      const r = document.querySelector(`#answer-form input[name="choice"][value="${c.answer}"]`); if (r) r.checked = true;
      const ev = evidenceOf(c); if ($('#evidence')) $('#evidence').value = ev || 'DEBUG';
      if (cmd === 'solve') { debugForce = true; $('#answer-form').requestSubmit(); }
      renderDebug(); return;
    }
    if (cmd === 'reject') {
      if (st.status !== 'open') return;
      const r = document.querySelector(`#answer-form input[name="choice"]:not([value="${c.answer}"])`); if (r) r.checked = true;
      $('#evidence').value = '0'; $('#answer-form').requestSubmit(); renderDebug(); return;
    }
    if (cmd === 'reopen') { Object.assign(st, { status: 'open', score: 0, bonus: 0, via: null, wrong: 0, hints: 0 }); refresh(); return; }
    if (cmd === 'model') { setEditor(c.model, false); runSql(); return; }
    if (cmd === 'solve-day') { dayCases(state.day).forEach(debugSolve); refresh(); return; }
    if (cmd === 'end-day') { dayCases(state.day).forEach(debugSolve); refresh(); if (allDone()) showFinal(true); else showDayEnd(true); return; }
    if (cmd === 'jump') {
      const d = Math.max(1, Math.min(DAYS(), parseInt($('#dbg-day').value, 10) || 1));
      if (inTraining()) state.phase = 'work';
      for (let k = 1; k < d; k++) dayCases(k).forEach(debugSolve);
      state.drafts[state.current] = $('#sql').value;
      state.day = d; state.minutes = 0; state.current = firstOpen();
      state.shimatsuAtStart = state.shimatsu; state.enjoAtStart = state.enjo || 0;
      $('#results').dataset.used = ''; refresh(); closeModal(); startDay(); return;
    }
    if (cmd === 'own-all') { SHOP().ITEMS.filter((it) => it.kind === 'tool').forEach((it) => { state.owned[it.id] = true; }); completeWords = null; }
    else if (cmd === 'own-none') { state.owned = {}; state.tape = 'lofi'; completeWords = null; }
    else if (cmd === 'fill-inv') SHOP().ITEMS.filter((it) => it.kind === 'consumable').forEach((it) => { state.inv[it.id] = it.max || 3; });
    else if (cmd === 'new-stock') state.shopSeenDay = 0;
    else if (cmd === 'clock') state.minutes = arg === 'end' ? DAY_END + 30 - DAY_START : arg.startsWith('+') ? state.minutes + +arg.slice(1) : +arg;
    else if (cmd === 'shimatsu') state.shimatsu = arg === '0' ? 0 : state.shimatsu + 1;
    else if (cmd === 'combo') { state.combo = (state.combo || 0) + 1; state.maxCombo = Math.max(state.maxCombo || 0, state.combo); }
    snd('pop'); refresh();
  }

  function bind() {
    const ta = $('#sql');
    ta.addEventListener('input', syncEditor);
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('click', updateComplete);
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) { const c = $('#complete'); if (c) c.hidden = true; } }, 150));
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql(); return; }
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (completeList.length && !$('#complete').hidden) acceptComplete(completeList[0]); else insertAtCursor('  '); return; }
      if (e.key === 'Escape' && !$('#complete').hidden) { $('#complete').hidden = true; completeList = []; }
    });
    $('#run').addEventListener('click', runSql);
    $('#btn-clear').addEventListener('click', () => setEditor('', true));

    document.addEventListener('submit', (e) => { if (e.target.id === 'answer-form') onSubmit(e); });
    document.addEventListener('change', (e) => {
      if (e.target.name === 'choice') { state.cases[state.current].choice = e.target.value; save(); }
    });
    document.addEventListener('input', (e) => { if (e.target.id === 'evidence') { state.cases[state.current].evidence = e.target.value; save(); } });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'btn-hint') showHint();
      else if (b.id === 'btn-giveup') giveUp(b);
      else if (b.id === 'btn-next') next();
      else if (b.id === 'btn-model') { setEditor(CASES[state.current].model, false); runSql(); }
      else if (b.dataset.case != null) goto(+b.dataset.case);
      else if (b.dataset.final) showFinal(true);
      else if (b.dataset.dayend) showDayEnd(true);
      else if (b.id === 'btn-bgm' && window.Sound) window.Sound.setBgm(!window.Sound.prefs.bgm);
      else if (b.id === 'btn-sfx' && window.Sound) { const on = !window.Sound.prefs.sfx; window.Sound.setSfx(on); if (on) snd('pop'); }
      else if (b.id === 'btn-spec') specAnswer(b);
      else if (b.id === 'btn-honest') honestReply();
      else if (b.id === 'btn-ban') banHammer();
      else if (b.dataset.table) insertStatement(`SELECT * FROM ${b.dataset.table} LIMIT 20;`);
      else if (b.dataset.col) insertAtCursor(b.dataset.col);
      else if (b.id && b.id.startsWith('tab-btn-')) switchTab(b.id.slice(8));
      else if (b.dataset.complete) acceptComplete(b.dataset.complete);
      else if (b.dataset.buy) buy(b.dataset.buy);
      else if (b.dataset.use) useItem(b.dataset.use);
      else if (b.dataset.tape) { state.tape = b.dataset.tape; save(); applyLooks(); if (window.Sound) window.Sound.playBgm(); snd('pop'); showShop(shopMode, true); }
      else if (b.dataset.toggleBezel) { state.bezelOn = !state.bezelOn; save(); applyLooks(); snd('pop'); showShop(shopMode, true); }
      else if (b.dataset.dbg) { if (state && debugOn) debugAction(b.dataset.dbg); }
      else if (b.id === 'btn-shop') { if (state && DB) { snd('pop'); showShop('desk'); } }
      else if (b.dataset.shopTab) { shopTab = b.dataset.shopTab; snd('page'); showShop(shopMode, true); $('#overlay').scrollTop = 0; }
      else if (b.dataset.drill) {
        const [t, key, ...lit] = b.dataset.drill.split('|');
        insertAndRun(`SELECT * FROM ${t} WHERE ${key} = ${lit.join('|')};`);
      } else if (b.dataset.uid) { insertAtCursor(b.dataset.uid); snd('pop'); }
      else if (b.dataset.recipe != null) { const r = RECIPES[+b.dataset.recipe]; if (r) { insertStatement(`-- 定石：${r[0]}\n${r[2](CASES[state.current])}`); snd('pop'); } }
      else if (b.id === 'btn-timeline') insertAndRun(timelineSql(CASES[state.current]));
      else if (b.id === 'btn-memo-add') { const v = $('#sql').value.trim(); if (v && state.snippets.length < 5) { state.snippets.push(v); save(); renderMemo(); snd('pop'); } }
      else if (b.dataset.memo != null) { insertStatement(state.snippets[+b.dataset.memo]); snd('pop'); }
      else if (b.dataset.memoDel != null) { state.snippets.splice(+b.dataset.memoDel, 1); save(); renderMemo(); snd('crumple'); }
      else if (b.dataset.sort) sortResult(b, +b.dataset.sort);
      else if (b.id === 'btn-lesson-sql') {
        const step = lessonOf(state.current).steps[state.cases[state.current].step || 0];
        if (step && step.sql) { insertStatement(step.sql); snd('pop'); }
      } else if (b.id === 'btn-skip-training') {
        if (!skipArmed) { skipArmed = true; b.textContent = 'もう一度押すとスキップ'; snd('pop'); return; }
        skipArmed = false; endTraining(false);
      } else if (b.dataset.act) {
        const a = b.dataset.act;
        if (a === 'start') { state.started = true; state.phase = 'work'; if (isTrain(state.current)) state.current = state.order[0]; save(); renderAll(); beginDay(false); }
        else if (a === 'start-training') { state.started = true; state.phase = 'training'; state.current = WORK; save(); renderAll(); beginTraining(false); }
        else if (a === 'resume') { if (inTraining()) beginTraining(true); else beginDay(true); }
        else if (a === 'skip-training') endTraining(false);
        else if (a === 'shop') showShop('dayend');
        else if (a === 'back-dayend') showDayEnd(false);
        else if (a === 'close-shop') closeModal();
        else if (a === 'end-training') endTraining(true);
        else if (a === 'replay-training') replayTraining();
        else if (a === 'reset') {
          if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'もう一度押すと記録を消して最初から'; snd('pop'); return; }
          state = freshState(); save();
          shownScore = null;
          $('#results').dataset.used = ''; renderAll();
          showIntro(); // 研修から始めるか、スキップするかを選び直す
        } else if (a === 'review') closeModal();
        else if (a === 'next-day') goNextDay();
        else if (a === 'show-final') showFinal(true);
        else if (a === 'resign') showResign();
        else if (a === 'back-final') showFinal(false);
        else if (a === 'copy') {
          const text = resultText();
          const done = () => { b.textContent = 'コピーしました'; snd('pop'); };
          try { navigator.clipboard.writeText(text).then(done, () => { b.textContent = text; }); } catch (err) { b.textContent = text; }
        }
      }
      if (b.id !== 'btn-skip-training' && skipArmed) { skipArmed = false; const g = $('#btn-skip-training'); if (g) g.textContent = '研修をスキップ'; }
      if (b.id !== 'btn-giveup' && giveupArmed) { giveupArmed = false; const g = $('#btn-giveup'); if (g) { g.textContent = '先輩に聞く'; g.classList.remove('btn-danger'); } }
      if (b.id !== 'btn-spec' && specArmed) { specArmed = false; const g = $('#btn-spec'); if (g) { g.textContent = '調べずに「仕様です」で即答する（1日1回）'; g.classList.remove('is-armed'); } }
    });
    // 結果の並べ替え（道具）：見出しのクリックと、絞り込み欄
    document.addEventListener('click', (e) => { const th = e.target.closest('.grid th[data-sort]'); if (th) sortResult(th, +th.dataset.sort); });
    document.addEventListener('input', (e) => {
      if (!e.target.classList || !e.target.classList.contains('rfilter')) return;
      const q = e.target.value.trim().toLowerCase(), tb = e.target.closest('.rblock').querySelector('tbody');
      tb.querySelectorAll('tr').forEach((tr) => { tr.hidden = !!q && !tr.textContent.toLowerCase().includes(q); });
    });
    document.addEventListener('dblclick', (e) => {
      const td = e.target.closest('.grid td'); if (!td || td.classList.contains('rn') || e.target.closest('.drill')) return;
      const inp = $('#evidence'); if (!inp) return;
      inp.value = td.textContent; state.cases[state.current].evidence = inp.value; save();
      document.querySelectorAll('.grid td.picked').forEach((x) => x.classList.remove('picked'));
      td.classList.add('picked');
      snd('pop');
      toast('根拠欄に入力しました', td.textContent);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#overlay').hidden && state && state.started) closeModal(); });
  }

  function sortResult(th, col) {
    const table = th.closest('table'), tb = table.querySelector('tbody');
    const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
    table.querySelectorAll('th[data-sort]').forEach((x) => { delete x.dataset.dir; });
    th.dataset.dir = dir;
    const val = (tr) => { const td = tr.children[col]; const t = td ? td.textContent : ''; const n = Number(t); return td && td.classList.contains('num') && Number.isFinite(n) ? n : t; };
    const rows = [...tb.querySelectorAll('tr')].sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ja'); return dir === 'asc' ? c : -c; });
    rows.forEach((r) => tb.appendChild(r));
    snd('pop');
  }

  // ---------------------------------------------------------------- sound toggles
  function bindSound() {
    const S = window.Sound;
    const bgm = $('#btn-bgm'), se = $('#btn-sfx');
    if (!S) { bgm.hidden = true; se.hidden = true; return; }
    const sync = (p) => { bgm.setAttribute('aria-pressed', String(p.bgm)); se.setAttribute('aria-pressed', String(p.sfx)); };
    sync(S.prefs); S.onChange(sync);
  }

  // ---------------------------------------------------------------- boot
  // 100件そろってから、保存データを読む（7件だった頃の保存データは合わないので最初から）
  function loadState(data) {
    const saved = validState(data) ? data : loadLocal();
    state = freshState();
    if (validState(saved) && validOrder(saved.order)) {
      const fresh = freshState();
      state = Object.assign(fresh, saved);
      // 研修の3件が増える前の保存データは、研修の分を空で足す
      state.cases = CASES.map((_, i) => Object.assign(freshCase(), (saved.cases || [])[i] || {}));
      if (state.phase !== 'training' || CASES.length === WORK) state.phase = 'work';
      if (!(state.current >= 0 && state.current < CASES.length) || isTrain(state.current) !== inTraining()) state.current = firstOpen();
      if (!state.day) state.day = 1;
      if (!state.dayLog) state.dayLog = {};
      delete state.history; // 実行履歴の機能は削除済み
      delete state.unplugged; // 電話線（TEL）の機能は削除済み
      // 命名規則の変更前に保存された下書きのテーブル名を、新しい名前に置き換える
      const RENAMED = [['character_logs', 'log_character'], ['item_logs', 'log_item'], ['login_logs', 'log_login'], ['currency_logs', 'log_currency'],
        ['payment_logs', 'log_payment'], ['error_logs', 'log_error'], ['m_items', 'mst_items'], ['m_products', 'mst_products'],
        ['worlds', 'mst_worlds'], ['characters', 'usr_characters'], ['users', 'usr_users']];
      Object.keys(state.drafts || {}).forEach((k) => {
        let s = String(state.drafts[k] || '');
        RENAMED.forEach(([from, to]) => { s = s.replace(new RegExp(`(?<![A-Za-z0-9_])${from}(?![A-Za-z0-9_])`, 'g'), to); });
        state.drafts[k] = s;
      });
    }
  }
  function start(data) {
    bind();
    bindSound();
    if (FXo()) document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = FXo().icon(el.dataset.icon, +el.dataset.scale || 3); });
    showIntro(); // DBの準備中は「出社する」を押せない
    initDb().then((ok) => {
      if (!ok) return;
      loadState(data);
      renderAll();
      if (allDone() && state.started) { showFinal(false); if (window.Sound) window.Sound.playBgm(); } else showIntro();
    });
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) { try { hot.snapshot(() => state); } catch (e) { /* ignore */ } }
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();

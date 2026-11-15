(function () {
  'use strict';

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORE_KEY = 'logs-dont-lie:v1';
  const NOW_UTC = '2026-11-13 01:00:00';
  const BASE = 100, WRONG = 25, HINT = 10, SHIMATSU = 15, FLOOR = 20;

  // ---------------------------------------------------------------- 資料
  const NOTES = `
    <h4>運用メモ</h4>
    <ul>
      <li>DBの日時はすべて <em>UTC</em>。問い合わせの日時は日本時間（JST = UTC+9）。</li>
      <li>SQLite方言。JSTで見るなら <code>datetime(created_at, '+9 hours')</code>。<code>CONVERT_TZ()</code> と <code>NOW()</code> も使えます。</li>
      <li>JSON列は <code>json_extract(detail, '$.from')</code> で取り出せます。</li>
      <li>参照専用。更新系のSQLを流すと始末書です。</li>
      <li>結果のセルをダブルクリックすると、回答の根拠欄に入ります。</li>
    </ul>`;

  const TABLE_DOCS = [
    { name: 'users', desc: 'アカウント。問い合わせには公開ID（public_id）が書かれています。', cols: [
      ['user_id', '内部ID。他のテーブルはこれで参照'], ['public_id', 'ゲーム内に表示されるID（例: U-38127）'], ['platform', 'iOS / Android / PC'],
      ['status', 'ACTIVE / BANNED'], ['created_at', 'アカウント作成日時 <em>UTC</em>']] },
    { name: 'characters', desc: 'キャラクター。削除は論理削除。名前はワールド内で一意。', cols: [
      ['character_id', 'キャラID'], ['user_id', '持ち主 → users'], ['world_id', '所属ワールド → worlds'], ['name', 'キャラ名'],
      ['job', '職業'], ['level', 'レベル'], ['created_at', '作成日時 <em>UTC</em>'], ['deleted_at', '削除日時 <em>UTC</em>。NULLなら未削除']] },
    { name: 'worlds', desc: 'ワールド（サーバー）。', cols: [['world_id', 'ワールドID'], ['name', 'ワールド名']] },
    { name: 'character_logs', desc: 'キャラクターの操作ログ。', cols: [
      ['log_id', 'ログID'], ['user_id', '操作したユーザー'], ['character_id', '対象キャラ'],
      ['action', 'CREATE / DELETE / RESTORE / RENAME / WORLD_TRANSFER'], ['detail', 'JSON。変更前後の値など'],
      ['ip_address', '操作元IP'], ['device_id', '操作元の端末'], ['created_at', '発生日時 <em>UTC</em>']] },
    { name: 'login_logs', desc: 'ログイン試行の記録（失敗も含む）。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ログイン先アカウント'], ['result', 'SUCCESS / FAILED'], ['ip_address', '接続元IP'],
      ['country', 'IPから推定した国コード'], ['device_id', '端末ID'], ['created_at', '発生日時 <em>UTC</em>']] },
    { name: 'item_logs', desc: 'アイテムの増減・移動。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ユーザー'], ['character_id', 'キャラ'], ['item_id', 'アイテム → m_items'],
      ['item_uid', '装備の個体ID（消耗品はNULL）'],
      ['action', 'GET / USE / SELL / TRADE_OUT / TRADE_IN / ENHANCE_SUCCESS / ENHANCE_FAIL / ENHANCE_DESTROY / STORAGE_IN / STORAGE_OUT / EXPIRE'],
      ['quantity', '個数'], ['target_user_id', 'トレード相手の user_id'], ['detail', 'JSON。入手元、強化前後のレベル、保護の巻物の使用（protect）など'],
      ['created_at', '発生日時 <em>UTC</em>']] },
    { name: 'm_items', desc: 'アイテムマスタ。', cols: [
      ['item_id', 'アイテムID'], ['name', '名前'], ['category', '武器 / 防具 / 消耗品 など'], ['rarity', 'N / R / SR / SSR / UR'], ['tradable', '1 = トレード可、0 = 不可']] },
    { name: 'currency_logs', desc: 'ゴールド・ジェムの増減。', cols: [
      ['log_id', 'ログID'], ['user_id', 'ユーザー'], ['currency', 'GOLD / GEM'], ['amount', '増減（マイナスは消費）'], ['balance_after', '変動後の残高'],
      ['reason', 'QUEST_REWARD / SHOP_BUY / SELL_ITEM / ENHANCE_COST / GUILD_DONATE / AUCTION_BUY / AUCTION_SELL / GACHA / PURCHASE'],
      ['ref_id', '関連ID（ギルド、決済の transaction_id など）'], ['created_at', '発生日時 <em>UTC</em>']] },
    { name: 'payment_logs', desc: 'ストア決済の記録。', cols: [
      ['payment_id', '決済ID'], ['user_id', 'ユーザー'], ['product_id', '商品 → m_products'], ['price_jpy', '金額（円）'],
      ['store', 'GooglePlay / AppStore / WebShop'], ['transaction_id', 'ストアの取引ID'], ['status', 'SUCCESS / CANCELED'], ['created_at', '決済日時 <em>UTC</em>']] },
    { name: 'm_products', desc: '課金商品マスタ。', cols: [['product_id', '商品ID'], ['name', '商品名'], ['price_jpy', '価格（円）'], ['gem', '付与されるジェム数']] },
    { name: 'error_logs', desc: 'サーバーのエラー・警告ログ。', cols: [
      ['log_id', 'ログID'], ['level', 'WARN / ERROR'], ['service', '発生したサービス'], ['message', 'メッセージ'], ['user_id', '関連ユーザー（NULLあり）'], ['created_at', '発生日時 <em>UTC</em>']] },
  ];

  const sub = (pub) => `(SELECT user_id FROM users WHERE public_id = '${pub}')`;
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
      evidence: { label: '決め手になったログの log_id（character_logs）', placeholder: '例: 1234', key: 'c1_delete' },
      hints: [
        'users テーブルで公開ID（U-38127）を検索すると、内部の <code>user_id</code> が分かります。ほかのテーブルは user_id で絞り込みます。',
        'characters でそのユーザーのキャラを確認しましょう。<code>deleted_at</code> に日時が入っていれば削除済みです。',
        "character_logs で <code>action = 'DELETE'</code> を探し、ip_address と device_id を login_logs の普段のログインと比べましょう。",
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月3日 21:42 に、お客様が普段ご利用の端末から、キャラクター名の入力確認を経て『シルフィ』の削除操作が行われた記録を確認いたしました。削除から30日以内のため復旧申請が可能ですが、同じ名前が他のお客様に使用されているため、復旧時に名前の変更が必要です。',
      reaction: '……あっ。サブキャラを消すつもりで、間違えたかもしれません。復旧申請します。すみませんでした。',
      explain: 'シルフィは UTC 11/3 12:42:18（JST 21:42）に削除されています。直前に普段と同じiPhone・同じIPでログインしており、キャラ名入力による削除確認（<code>confirm: name_input</code>）も通っています。本人の操作と判断できます。削除の直前にエリクサーを友人へ渡しているのも、整理していた様子をうかがわせます。なお、アルファでは 11/5 に別のユーザーが「シルフィ」を作成済み。復旧には名前変更が必要になる点も添えておくと親切です。',
      model: `-- 公開IDから内部の user_id を引く
SELECT * FROM users WHERE public_id = 'U-38127';

-- キャラの状態
SELECT * FROM characters WHERE user_id = ${sub('U-38127')};

-- 削除ログ（JSTも並べる）
SELECT log_id, action, detail, ip_address, device_id,
       created_at, datetime(created_at, '+9 hours') AS jst
FROM character_logs
WHERE user_id = ${sub('U-38127')} AND action = 'DELETE';

-- 普段のログイン元
SELECT ip_address, device_id, COUNT(*) AS cnt
FROM login_logs
WHERE user_id = ${sub('U-38127')}
GROUP BY ip_address, device_id;`,
      starter: `-- ここにSQLを書いて Ctrl+Enter（Macは ⌘+Enter）で実行
-- まずは問い合わせてきたユーザーを探してみよう
SELECT * FROM users WHERE public_id = 'U-38127';
`,
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
      evidence: { label: '決め手になったログの log_id（item_logs）', placeholder: '例: 1234', key: 'c2_destroy' },
      hints: [
        'アイテム名は <code>m_items</code> にあります。item_id を調べて item_logs を絞り込みましょう。',
        'item_logs をそのユーザー・そのアイテムで絞り込み、<code>ORDER BY created_at</code> で時系列に並べましょう。',
        '最後のほうのログに注目。倉庫から出した後、何をしている？ detail の <code>protect</code> は保護の巻物を使ったかどうかです。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、『煌星の大剣』は11月11日 22:01 に倉庫から取り出され、22:03 に+9への強化に成功した後、22:05 に保護の巻物を使用せずに+10への強化を行い、強化失敗により消滅したことを確認いたしました。仕様どおりの挙動のため、補填はいたしかねます。何卒ご理解ください。',
      reaction: '……+9になった勢いでいけると思ったんです。巻物、ケチるんじゃなかった。',
      explain: '大剣は 11/10 に倉庫へ入れられた後、11/11 22:01（JST）に倉庫から取り出されています。22:03 に +8→+9 の強化に成功し、22:05 に +9→+10 の強化を保護の巻物なし（<code>protect: false</code>）で行って ENHANCE_DESTROY。以前は保護の巻物を使っていたこともログから分かります。また『煌星の大剣』はトレード不可（<code>m_items.tradable = 0</code>）なので、トレードの線はそもそもありません。別ユーザーも同じ大剣を持っていますが、item_uid が違う別の個体です。',
      model: `SELECT * FROM m_items WHERE name = '煌星の大剣';

SELECT log_id, action, item_uid, detail,
       datetime(created_at, '+9 hours') AS jst
FROM item_logs
WHERE user_id = ${sub('U-52904')}
  AND item_id = (SELECT item_id FROM m_items WHERE name = '煌星の大剣')
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
      evidence: { label: '決め手になったログの log_id（currency_logs）', placeholder: '例: 1234', key: 'c3_donate' },
      hints: [
        "currency_logs をそのユーザーの <code>currency = 'GOLD'</code> で絞り込みましょう。",
        '問い合わせの「11月8日 朝8時」は日本時間。DBの created_at は UTC です。9時間ずらすと何日の何時？',
        "<code>datetime(created_at, '+9 hours')</code> を SELECT に足すと、日本時間で読めます。",
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月8日 7:47 にお客様の普段の端末からログインがあり、7:51 にギルドへ 4,800,000 ゴールドを寄付する操作が行われていたことを確認いたしました。第三者によるログインの形跡はございません。',
      reaction: '4,800,000……48万のつもりで、ゼロをひとつ多く押してました。ギルマスに相談してきます……。',
      explain: 'JST の 11/8 08:00 は UTC の 11/7 23:00。UTC 11/7 22:47（JST 07:47）に普段のスマホ・IPでログインし、22:51（JST 07:51）に GUILD_DONATE で 4,800,000 ゴールドを寄付しています。UTC の「11/8」だけを見ると 1万ゴールドの寄付しか見つからず、「記録なし」と判断したり、別のログを根拠にしてしまう落とし穴でした。',
      model: `SELECT log_id, amount, balance_after, reason, ref_id,
       created_at, datetime(created_at, '+9 hours') AS jst
FROM currency_logs
WHERE user_id = ${sub('U-27730')}
  AND currency = 'GOLD'
  AND datetime(created_at, '+9 hours') BETWEEN '2026-11-08 00:00:00' AND '2026-11-08 23:59:59'
ORDER BY created_at;

SELECT * FROM login_logs
WHERE user_id = ${sub('U-27730')}
  AND created_at BETWEEN '2026-11-07 15:00:00' AND '2026-11-08 15:00:00';`,
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
      hints: [
        "characters で <code>name = '漆黒の堕天使'</code> を検索すると……複数ヒットするかも。user_id で持ち主を確かめましょう。",
        'world_id は <code>worlds</code> テーブルと対応しています。問い合わせのワールドと一致していますか？',
        'character_logs でこのキャラの action を確認しましょう。detail に移動元と移動先が入っています。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、『漆黒の堕天使』は11月9日 19:14 にワールド移動チケットを使用して、アルファからガンマへ移動しております。キャラクターは削除されておりませんので、ガンマにログインしてご確認ください。',
      reaction: 'ガンマのイベントに行くために移動したの、完全に忘れてました……。いました。よかった……。',
      explain: '11/9 19:14（JST）に、ジェムショップで買ったワールド移動チケットを使い、アルファ（1）からガンマ（3）へ移動しています（<code>WORLD_TRANSFER</code>）。キャラクターは削除されていません。ベータにも同じ名前のキャラがいますが、別のユーザーのものです。',
      model: `SELECT c.*, w.name AS world_name
FROM characters c JOIN worlds w USING (world_id)
WHERE c.name = '漆黒の堕天使';

SELECT log_id, action, detail, datetime(created_at, '+9 hours') AS jst
FROM character_logs
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
      hints: [
        'payment_logs をそのユーザーで見てみましょう。<code>status</code> にも注目。',
        "決済が SUCCESS なら、currency_logs に <code>ref_id = transaction_id</code> の GEM 付与（reason = 'PURCHASE'）があるはずです。",
        'error_logs の同じ時刻あたりも確認してみましょう。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月10日 20:20 のご購入（取引ID: GPA.3391-0042-7781-55102）について、決済は完了していたものの、サーバーの不具合によりジェムが付与されていなかったことを確認いたしました。ご迷惑をおかけし申し訳ございません。ジェム 1,800 個を補填いたします。',
      reaction: 'ちゃんと調べてもらえて安心しました！ありがとうございます！',
      explain: '11/10 20:18（JST）の決済はユーザーがキャンセル（CANCELED）、20:20 の決済が SUCCESS です。正常な購入なら currency_logs に同じ transaction_id を ref_id に持つ PURCHASE が記録されますが、この決済には存在しません。直後の error_logs には GemGrantService のデッドロックによる付与中断が残っています。不具合として 1,800 ジェムの補填対象です。11/5 の購入は正常に付与されています。',
      model: `SELECT p.*, datetime(p.created_at, '+9 hours') AS jst,
       c.log_id AS grant_log_id, c.amount AS granted
FROM payment_logs p
LEFT JOIN currency_logs c
  ON c.ref_id = p.transaction_id AND c.reason = 'PURCHASE'
WHERE p.user_id = ${sub('U-73315')}
ORDER BY p.created_at;

SELECT * FROM error_logs
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
      hints: [
        'login_logs で直近のログインを見てみましょう。result・ip_address・country・device_id に注目。',
        "item_logs の <code>action = 'TRADE_OUT'</code> を確認。<code>target_user_id</code> はアイテムを渡した相手の user_id です。",
        'target_user_id を users と JOIN すると公開IDが分かります。いつ作られたアカウントかも見てみましょう。',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、11月12日 12:10 に、お客様が普段ご利用の端末とは異なる海外の環境からログインがあり、その直後にアイテムが別のアカウントへ移動していたことを確認いたしました。第三者による不正ログインの可能性が高いため、至急パスワードの変更をお願いいたします。アイテムの扱いについては、担当部署で調査のうえ改めてご連絡いたします。',
      reaction: 'パスワード、他のサイトと同じのを使ってました……。すぐ変えます。',
      explain: '11/12 12:02〜12:08（JST）に、オランダのIP・見慣れないPC端末から5回ログインに失敗した後、12:10 にログインが成功しています。その直後、天穹の弓・竜鱗の外套・星詠みの耳飾り・エリクサー30個が、11/10 に作られたばかりのアカウント U-90417 へトレードされました。U-90417 も同じIPからログインしています。11/8 のハイポーションのトレードは普段の端末からの本人操作で、今回とは無関係です。乗っ取りの疑いが強いので、パスワード再設定の案内とセキュリティチームへのエスカレーションが必要です。',
      model: `SELECT log_id, result, ip_address, country, device_id,
       datetime(created_at, '+9 hours') AS jst
FROM login_logs
WHERE user_id = ${sub('U-61458')}
  AND created_at >= '2026-11-10'
ORDER BY created_at;

SELECT i.log_id, m.name, i.quantity, u.public_id AS to_public_id,
       u.created_at AS to_created_at,
       datetime(i.created_at, '+9 hours') AS jst
FROM item_logs i
JOIN m_items m USING (item_id)
JOIN users u ON u.user_id = i.target_user_id
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
      hints: [
        '問い合わせアカウント（U-15562）の作成日時と、持っているキャラを確認しましょう。',
        "『ミルク』という名前のキャラは何人もいます。characters を name で検索し、持ち主を洗い出しましょう。",
        '問い合わせアカウントがログインした ip_address から、ほかにログインしているアカウントはありませんか？',
      ],
      reply: 'お問い合わせありがとうございます。調査の結果、現在ご利用のアカウントは11月12日に新しく作成されたもので、『ミルク』は以前の端末でご利用のアカウントに残っていることを確認いたしました。以前の端末で引き継ぎコードを発行し、新しい端末で入力していただくと、『ミルク』のデータを引き継げます。',
      reaction: '引き継ぎコード、発行しただけで入力してませんでした……！前のスマホ、まだ捨ててなくてよかった。',
      explain: 'U-15562 は 11/12 20:02（JST）に新しいiPhoneで作られたアカウントで、『ミルク』の作成記録はありません（よく似た『みるく』があるだけ）。『ミルク』を持つアカウントは複数ありますが、アルファの『ミルク』の持ち主 U-31846 だけが、問い合わせアカウントと同じ自宅回線のIP（114.150.82.9）からログインしています。最終ログインは 11/12 08:05（JST）で「昨日の朝まで遊んでいた」とも一致。引き継ぎをせずに新しいアカウントを作ってしまったと考えられます。',
      model: `SELECT * FROM users WHERE public_id = 'U-15562';
SELECT * FROM characters WHERE user_id = ${sub('U-15562')};

-- 『ミルク』の持ち主たち
SELECT c.*, u.public_id FROM characters c JOIN users u USING (user_id)
WHERE c.name = 'ミルク';

-- 同じIPからログインしているアカウント
SELECT u.public_id, l.ip_address, COUNT(*) AS cnt,
       MAX(datetime(l.created_at, '+9 hours')) AS last_jst
FROM login_logs l JOIN users u USING (user_id)
WHERE l.ip_address IN (
  SELECT ip_address FROM login_logs WHERE user_id = ${sub('U-15562')}
)
GROUP BY u.public_id, l.ip_address;`,
    },
  ];

  const RANKS = [
    [680, 'ログの声が聞こえる人', '問い合わせ文より先にログが語りかけてくる境地。テックリードの席が空いています。'],
    [580, '頼れるサーバーエンジニア', 'CSチームから名指しで依頼が来るようになりました。'],
    [450, '一人前の調査担当', '時差の罠にも、もう引っかかりません。'],
    [300, '見習いエンジニア', 'ログを読む手つきが板についてきました。'],
    [0, '研修やり直し', 'まずは users テーブルから。焦らず WHERE を書きましょう。'],
  ];

  // ---------------------------------------------------------------- state
  let DB = null, KEYS = {}, COUNTS = {};
  let state = freshState();
  function freshState() {
    return {
      started: false, current: 0, shimatsu: 0,
      cases: CASES.map(() => ({ status: 'open', wrong: 0, hints: 0, score: 0, queries: 0, heavy: false, choice: null, evidence: '' })),
      drafts: {}, history: [],
    };
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  function loadLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } }
  function validState(s) { return s && Array.isArray(s.cases) && s.cases.length === CASES.length && typeof s.current === 'number'; }

  const totalScore = () => Math.max(0, state.cases.reduce((a, c) => a + c.score, 0) - state.shimatsu * SHIMATSU);
  const allDone = () => state.cases.every((c) => c.status !== 'open');
  const firstOpen = () => { const i = state.cases.findIndex((c) => c.status === 'open'); return i < 0 ? CASES.length - 1 : i; };

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
    if (/^(UTC|GMT|SYSTEM|Z)$/i.test(s)) return 0;
    if (/^(JST|Asia\/Tokyo)$/i.test(s)) return 540;
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
      DB.create_function('JST', (dt) => shiftDt(dt, 540));
      DB.create_function('NOW', () => NOW_UTC);
      DB.run('PRAGMA query_only = 1');
      conn.classList.add('is-ready'); label.textContent = 'prod-replica-01';
      $('#run').disabled = false;
      renderSchema();
      if (!$('#results').dataset.used) renderResultsEmpty();
    } catch (e) {
      conn.classList.add('is-error');
      label.textContent = 'DBに接続できませんでした';
      $('#results').innerHTML = `<div class="rerr">データベースを読み込めませんでした: ${esc(e.message)}<small>ページを再読み込みしてください。ファイル単体で開いている場合は、sql-wasm.js / sql-wasm.wasm / sql-asm.js を同じフォルダに置き、Webサーバー経由で開いてください。</small></div>`;
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
    save(); renderHud();
    toast(`始末書 ${state.shimatsu}枚目`, (SHIMATSU_MSG[word] || '参照系（SELECT）以外のSQLは実行できません。') + ` −${SHIMATSU}点`, true);
  }

  const MYSQL_TIPS = [
    [/no such function: DATE_ADD|no such function: DATE_SUB|no such function: ADDTIME/i, "SQLite では datetime(created_at, '+9 hours') のように書きます。"],
    [/no such function: DATE_FORMAT/i, "SQLite では strftime('%Y-%m-%d %H:%M', created_at) を使います。"],
    [/no such function: (IFNULL2|IF)\b/i, 'SQLite では iif(条件, 真, 偽) か CASE WHEN を使います。'],
    [/no such column/i, '列名はテーブル定義で確認できます。文字列は "ダブル" ではなく \'シングル\' クォートで囲みます。'],
    [/no such table/i, 'テーブル名は右の「テーブル定義」に一覧があります。'],
    [/readonly|read-only/i, 'このDBは参照専用です。'],
    [/syntax error/i, 'カンマ・括弧・クォートの閉じ忘れがないか確認しましょう。'],
  ];

  function runSql() {
    if (!DB) return;
    const ta = $('#sql');
    const selected = ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '';
    const src = selected || ta.value;
    const stmts = splitStatements(src);
    const out = $('#results');
    out.dataset.used = '1';
    if (!stmts.length) { out.innerHTML = '<p class="rnote">実行するSQLがありません。</p>'; return; }
    const bad = stmts.find((s) => !isAllowed(s));
    if (bad) {
      issueShimatsu(firstWord(bad));
      out.innerHTML = `<div class="rerr">実行を止めました: ${esc(firstWord(bad) || 'この文')} は参照系ではありません。<small>このコンソールで使えるのは SELECT / WITH / EXPLAIN と PRAGMA table_info だけです。</small></div>`;
      pushHistory(src, false, '始末書');
      return;
    }
    const cs = state.cases[state.current];
    cs.queries++;
    const blocks = [];
    let ok = true, totalRows = 0, heavy = false;
    for (let k = 0; k < stmts.length; k++) {
      const s = stmts[k];
      const t0 = performance.now();
      let st;
      try {
        st = DB.prepare(s);
        const cols = st.getColumnNames();
        const rows = [];
        let count = 0;
        while (st.step()) { if (count < 1000) rows.push(st.get()); count++; }
        const ms = performance.now() - t0;
        totalRows += count; if (count >= 2000) heavy = true;
        blocks.push(renderTable(k, stmts.length, s, cols, rows, count, ms));
      } catch (e) {
        ok = false;
        const tip = /\bINTERVAL\b/i.test(s) ? "SQLite に INTERVAL はありません。datetime(created_at, '+9 hours') のように書きます。"
          : (MYSQL_TIPS.find(([re]) => re.test(e.message)) || [])[1];
        if (/readonly|read-only/i.test(e.message)) issueShimatsu('');
        blocks.push(`<div class="rblock"><div class="rmeta"><b>#${k + 1}</b><span class="rsql">${esc(oneLine(s))}</span></div><div class="rerr">${esc(e.message)}${tip ? `<small>${esc(tip)}</small>` : ''}</div></div>`);
        break;
      } finally { if (st) st.free(); }
    }
    out.innerHTML = blocks.join('');
    out.scrollTop = 0;
    pushHistory(src, ok, ok ? `${totalRows.toLocaleString()}行` : 'エラー');
    if (heavy && !cs.heavy) {
      cs.heavy = true;
      toast('インフラ担当より', '「いま重いクエリ流したの誰？」 WHERE や LIMIT で絞り込みましょう。');
    }
    save();
  }
  const oneLine = (s) => stripComments(s).replace(/\s+/g, ' ').trim();
  function renderTable(k, n, sql, cols, rows, count, ms) {
    const head = `<tr><th class="rn">#</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = rows.map((r, i) => `<tr><td class="rn">${i + 1}</td>${r.map((v) => {
      if (v === null || v === undefined) return '<td class="null">NULL</td>';
      if (typeof v === 'number') return `<td class="num">${esc(v)}</td>`;
      if (v instanceof Uint8Array) return '<td class="null">BLOB</td>';
      return `<td title="${esc(v)}">${esc(v)}</td>`;
    }).join('')}</tr>`).join('');
    const more = count > rows.length ? `<span>（先頭 ${rows.length.toLocaleString()} 行を表示）</span>` : '';
    const label = n > 1 ? `<b>#${k + 1}</b>` : '';
    return `<div class="rblock"><div class="rmeta">${label}<span><b>${count.toLocaleString()}</b> 行</span>${more}<span>${ms.toFixed(1)} ms</span><span class="rsql">${esc(oneLine(sql))}</span></div>
      <div class="twrap"><table class="grid"><thead>${head}</thead><tbody>${body || ''}</tbody></table></div></div>`;
  }
  function renderResultsEmpty() {
    $('#results').innerHTML = `<div class="results-empty"><b>SELECT * FROM 問い合わせ;</b>左の問い合わせ票を読み、SQLでログを調べましょう。右のテーブル定義のテーブル名をクリックすると、SELECT文がエディタに入ります。</div>`;
  }

  function pushHistory(sql, ok, meta) {
    state.history.unshift({ sql: sql.trim().slice(0, 2000), ok, meta, c: state.current + 1 });
    state.history = state.history.slice(0, 40);
    renderHistory();
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
    const ta = $('#sql');
    $('#hl').innerHTML = highlight(ta.value);
    syncScroll();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { state.drafts[state.current] = ta.value; save(); }, 300);
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
  function renderHud() {
    $('#score').textContent = totalScore();
    $('#shimatsu').textContent = state.shimatsu;
    $('#stat-shimatsu').classList.toggle('warn', state.shimatsu > 0);
    const q = $('#queue');
    const unlocked = firstOpen();
    q.innerHTML = CASES.map((c, i) => {
      const st = state.cases[i].status;
      const cls = ['chip', i === state.current ? 'is-current' : '', st === 'solved' ? 'is-solved' : '', st === 'gaveup' ? 'is-gaveup' : ''].join(' ');
      const dis = i > unlocked && st === 'open' ? 'disabled' : '';
      return `<button class="${cls}" data-case="${i}" ${dis} type="button" aria-current="${i === state.current}"><i class="lamp"></i><span class="no">#${i + 1}</span>${esc(c.label)}</button>`;
    }).join('') + (allDone() ? '<button class="chip is-current" data-final="1" type="button"><i class="lamp"></i>結果を見る</button>' : '');
  }

  function renderTicket() {
    const c = CASES[state.current], st = state.cases[state.current];
    const t = $('#ticket');
    t.innerHTML = `
      <div class="ticket-head"><h2>問い合わせ票</h2><span class="tno">No. ${esc(c.no)}</span></div>
      <dl class="ticket-grid">
        <dt>受付日時</dt><dd>2026/${esc(jstLabel(c.received + ':00').replace(/:00$/, ''))} JST</dd>
        <dt>公開ID</dt><dd>${esc(c.user)}</dd>
        <dt>ワールド</dt><dd>${esc(c.world)}</dd>
        <dt>種別</dt><dd>${esc(c.category)}</dd>
      </dl>
      <p class="ticket-body">${esc(c.body)}</p>
      <p class="ticket-note"><b>CS担当メモ：</b>${esc(c.note)}</p>
      ${st.status === 'solved' ? stampHtml('解決', '') : st.status === 'gaveup' ? stampHtml('解説', 'is-gaveup') : ''}`;
  }
  function stampHtml(text, cls) {
    return `<div class="stamp ${cls}"><span><span class="s-main">${text}</span><span class="s-sub">2026.11.13</span></span></div>`;
  }

  function renderAnswer() {
    const i = state.current, c = CASES[i], st = state.cases[i];
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
          <button class="btn" type="button" id="btn-hint" ${st.hints >= c.hints.length ? 'disabled' : ''}>ヒントを見る（−${HINT}）</button>
          <button class="btn btn-ghost" type="button" id="btn-giveup">先輩に聞く</button>
        </div>
        <ol class="hints" id="hints">${c.hints.slice(0, st.hints).map((h, k) => `<li><b>${k + 1}</b>${h}</li>`).join('')}</ol>
        <p class="feedback" id="feedback" hidden></p>
      </form>`;
  }

  function resolutionHtml(i) {
    const c = CASES[i], st = state.cases[i];
    const solved = st.status === 'solved';
    const right = c.options.find((o) => o[0] === c.answer)[1];
    return `<div class="card resolution">
      <div class="points"><b>${solved ? '+' + st.score : '0'}</b><span>${solved ? `誤答 ${st.wrong} 回・ヒント ${st.hints} 回` : '先輩に聞いたので 0 点'}</span></div>
      <div><h3>正しい結論</h3><p class="explain">${esc(right)}</p></div>
      <div><h3>ユーザーへの回答</h3><p class="reply">${esc(c.reply)}</p></div>
      ${solved ? `<p class="reaction">ユーザーからの返信：「${esc(c.reaction)}」</p>` : ''}
      <div><h3>解説</h3><p class="explain">${c.explain}</p></div>
      <div><h3>模範SQL</h3><pre class="model">${highlight(c.model)}</pre>
        <div class="btn-row"><button class="btn" type="button" id="btn-model">エディタに貼って実行</button></div></div>
      <div class="btn-row"><button class="btn btn-primary" type="button" id="btn-next">${allDone() ? '結果を見る' : '次のチケットへ'}</button></div>
    </div>`;
  }

  function renderSchema() {
    $('#tab-schema').innerHTML = `<div class="notes">${NOTES}</div>` + TABLE_DOCS.map((t, k) => `
      <details class="tbl" ${k < 2 ? 'open' : ''}>
        <summary><span class="tbl-name">${t.name}</span><span class="tbl-count">${COUNTS[t.name] != null ? COUNTS[t.name].toLocaleString() + '行' : ''}</span></summary>
        <p class="tbl-desc">${t.desc}</p>
        <ul class="cols">${t.cols.map(([n, d]) => `<li><button type="button" data-col="${n}">${n}</button><span class="cmt">${d}</span></li>`).join('')}</ul>
        <button class="tbl-insert" type="button" data-table="${t.name}">SELECT文をエディタに入れる</button>
      </details>`).join('');
  }
  function renderHistory() {
    const h = state.history;
    $('#tab-history').innerHTML = h.length ? `<ul class="hist">${h.map((x, k) => `<li class="${x.ok ? '' : 'is-err'}"><button type="button" data-hist="${k}"><span class="hmeta">#${x.c} · ${esc(x.meta)}</span>${esc(x.sql)}</button></li>`).join('')}</ul>`
      : '<p class="rnote">まだSQLを実行していません。実行したSQLはここに残り、クリックするとエディタに戻せます。</p>';
  }

  function renderAll() {
    renderHud(); renderTicket(); renderAnswer(); renderSchema(); renderHistory();
    const draft = state.drafts[state.current];
    setEditor(draft != null ? draft : (CASES[state.current].starter || `-- #${state.current + 1} ${CASES[state.current].label}（${CASES[state.current].user}）\n`));
    if (!$('#results').dataset.used) renderResultsEmpty();
  }

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
      fb.hidden = false; fb.className = 'feedback is-info';
      fb.textContent = !choice ? '調査結論を選んでください。' : '根拠を入力してください。ログを見て、決め手になった値を書きます。';
      return;
    }
    if (!DB) { fb.hidden = false; fb.className = 'feedback is-info'; fb.textContent = 'DBの準備中です。少し待ってから送信してください。'; return; }
    const okC = choice === c.answer, okE = checkEvidence(c, ev);
    if (okC && okE) {
      st.status = 'solved';
      st.score = Math.max(FLOOR, BASE - st.wrong * WRONG - st.hints * HINT);
      save();
      renderHud(); renderTicket(); renderAnswer();
      const s = $('#ticket .stamp'); if (s) s.classList.add('slam');
      $('#ticket-scroll').scrollTop = 0;
      return;
    }
    st.wrong++;
    save(); renderHud();
    const msg = !okC && !okE ? '先輩「結論も根拠も、もう一度ログを見直してみて」'
      : !okC ? '先輩「根拠に挙げた値は合ってる。でも、そこから言える結論は別じゃない？」'
        : '先輩「結論はいい線。でも根拠の値が違う。どのログが決め手？」';
    fb.hidden = false; fb.className = 'feedback';
    fb.textContent = `差し戻されました（−${WRONG}点）。${msg}`;
    fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = $('#ticket');
    t.querySelectorAll('.stamp.is-reject').forEach((x) => x.remove());
    t.insertAdjacentHTML('beforeend', stampHtml('差戻', 'is-reject fade'));
    t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
  }
  function showHint() {
    const i = state.current, c = CASES[i], st = state.cases[i];
    if (st.hints >= c.hints.length) return;
    st.hints++; save(); renderHud();
    $('#hints').insertAdjacentHTML('beforeend', `<li><b>${st.hints}</b>${c.hints[st.hints - 1]}</li>`);
    if (st.hints >= c.hints.length) $('#btn-hint').disabled = true;
  }
  let giveupArmed = false;
  function giveUp(btn) {
    if (!giveupArmed) { giveupArmed = true; btn.textContent = '本当に聞く？（このチケットは0点）'; btn.classList.add('btn-danger'); return; }
    giveupArmed = false;
    const st = state.cases[state.current];
    st.status = 'gaveup'; st.score = 0; save();
    renderHud(); renderTicket(); renderAnswer();
    const s = $('#ticket .stamp'); if (s) s.classList.add('slam');
  }
  function goto(i) {
    if (i === state.current) return;
    state.drafts[state.current] = $('#sql').value;
    state.current = i; giveupArmed = false; save();
    renderHud(); renderTicket(); renderAnswer();
    const draft = state.drafts[i];
    setEditor(draft != null ? draft : (CASES[i].starter || `-- #${i + 1} ${CASES[i].label}（${CASES[i].user}）\n`));
    $('#ticket-scroll').scrollTop = 0;
  }
  function next() {
    if (allDone()) showFinal(); else goto(firstOpen());
  }

  // ---------------------------------------------------------------- modals
  function openModal(html) { $('#modal').innerHTML = html; $('#overlay').hidden = false; const b = $('#modal button'); if (b) b.focus(); }
  function closeModal() { $('#overlay').hidden = true; }
  function showIntro() {
    const resume = state.started && !allDone();
    openModal(`
      <p class="eyebrow">株式会社ノクトゲームス　運用チーム　配属初日</p>
      <h1>ログは嘘をつかない<span class="cursor"></span></h1>
      <p class="lead">サーバーエンジニア問い合わせ対応シミュレーター</p>
      <p>あなたは運営中のMMORPG『クロノリア・オンライン』のサーバーエンジニア。CSチームから「キャラが消えた」「課金が反映されない」といった調査依頼のチケットが回ってきます。</p>
      <p>本番DB（参照専用レプリカ）にSQLを投げてログを確かめ、事実にもとづいてユーザーへ回答してください。ユーザーの言い分が正しいとは限りません。</p>
      <dl class="rules">
        <dt>回答</dt><dd>調査結論を選び、決め手になった値（ログIDなど）を根拠として添える</dd>
        <dt>得点</dt><dd>1件 ${BASE} 点。差し戻し −${WRONG}、ヒント −${HINT}</dd>
        <dt>禁止</dt><dd>更新系のSQL。流そうとすると始末書（−${SHIMATSU}）</dd>
        <dt>注意</dt><dd>DBの日時は UTC、問い合わせは日本時間</dd>
      </dl>
      <div class="btn-row">
        ${resume ? `<button class="btn btn-primary" type="button" data-act="resume">続きから（#${firstOpen() + 1}）</button><button class="btn" type="button" data-act="reset">最初からやり直す</button>`
          : '<button class="btn btn-primary" type="button" data-act="start">出社する</button>'}
      </div>`);
  }
  function rankOf(score) { return RANKS.find((r) => score >= r[0]); }
  function showFinal() {
    const score = totalScore(); const [, title, line] = rankOf(score);
    const solved = state.cases.filter((c) => c.status === 'solved').length;
    const rows = CASES.map((c, i) => { const s = state.cases[i]; return `<tr><td>#${i + 1} ${esc(c.label)}</td><td class="${s.status === 'solved' ? 'ok' : 'ng'}">${s.status === 'solved' ? '解決' : s.status === 'gaveup' ? '先輩に聞いた' : '未対応'}</td><td class="r">${s.wrong}</td><td class="r">${s.hints}</td><td class="r">${s.queries}</td><td class="r">${s.score}</td></tr>`; }).join('');
    openModal(`
      <p class="eyebrow">本日の業務終了　2026.11.13</p>
      <div class="final-score"><b>${score}</b><span>/ ${CASES.length * BASE} 点　${solved}件解決</span></div>
      <p class="final-title"><span>称号</span>${esc(title)}${state.shimatsu >= 3 ? '（始末書の常連）' : ''}</p>
      <p>${esc(line)}</p>
      <table class="summary"><thead><tr><th>チケット</th><th>結果</th><th class="r">差戻</th><th class="r">ヒント</th><th class="r">SQL</th><th class="r">点</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">始末書 ${state.shimatsu} 枚（−${state.shimatsu * SHIMATSU}）</td><td class="r"></td></tr></tfoot></table>
      <div class="btn-row">
        <button class="btn btn-primary" type="button" data-act="copy">結果をコピー</button>
        <button class="btn" type="button" data-act="review">チケットを見直す</button>
        <button class="btn btn-ghost" type="button" data-act="reset">最初から遊ぶ</button>
      </div>`);
  }
  function resultText() {
    const score = totalScore(); const [, title] = rankOf(score);
    const marks = state.cases.map((c) => (c.status === 'solved' ? (c.wrong === 0 && c.hints === 0 ? '◎' : '○') : '×')).join('');
    return `『ログは嘘をつかない』 ${score}/${CASES.length * BASE}点 ${marks} 称号「${title}」 始末書${state.shimatsu}枚`;
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
  function bind() {
    const ta = $('#sql');
    ta.addEventListener('input', syncEditor);
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql(); return; }
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); insertAtCursor('  '); }
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
      else if (b.dataset.final) showFinal();
      else if (b.dataset.table) insertStatement(`SELECT * FROM ${b.dataset.table} LIMIT 20;`);
      else if (b.dataset.col) insertAtCursor(b.dataset.col);
      else if (b.dataset.hist != null) { const h = state.history[+b.dataset.hist]; if (h) setEditor(h.sql, true); }
      else if (b.id === 'tab-btn-schema' || b.id === 'tab-btn-history') {
        const hist = b.id === 'tab-btn-history';
        $('#tab-btn-schema').setAttribute('aria-selected', String(!hist));
        $('#tab-btn-history').setAttribute('aria-selected', String(hist));
        $('#tab-schema').hidden = hist; $('#tab-history').hidden = !hist;
      } else if (b.dataset.act) {
        const a = b.dataset.act;
        if (a === 'start' || a === 'resume') { state.started = true; save(); closeModal(); $('#sql').focus(); }
        else if (a === 'reset') {
          if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'もう一度押すと記録を消して最初から'; return; }
          state = freshState(); state.started = true; save();
          $('#results').dataset.used = ''; renderAll(); closeModal();
        } else if (a === 'review') closeModal();
        else if (a === 'copy') {
          const text = resultText();
          const done = () => { b.textContent = 'コピーしました'; };
          try { navigator.clipboard.writeText(text).then(done, () => { b.textContent = text; }); } catch (err) { b.textContent = text; }
        }
      }
      if (b.id !== 'btn-giveup' && giveupArmed) { giveupArmed = false; const g = $('#btn-giveup'); if (g) { g.textContent = '先輩に聞く'; g.classList.remove('btn-danger'); } }
    });
    document.addEventListener('dblclick', (e) => {
      const td = e.target.closest('.grid td'); if (!td || td.classList.contains('rn')) return;
      const inp = $('#evidence'); if (!inp) return;
      inp.value = td.textContent; state.cases[state.current].evidence = inp.value; save();
      document.querySelectorAll('.grid td.picked').forEach((x) => x.classList.remove('picked'));
      td.classList.add('picked');
      toast('根拠欄に入力しました', td.textContent);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#overlay').hidden && state.started) closeModal(); });
  }

  // ---------------------------------------------------------------- boot
  function start(data) {
    const saved = validState(data) ? data : loadLocal();
    if (validState(saved)) {
      state = Object.assign(freshState(), saved);
      state.cases = state.cases.map((c, i) => Object.assign(freshState().cases[i], c));
    }
    bind();
    renderAll();
    if (allDone() && state.started) showFinal(); else showIntro();
    initDb();
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) { try { hot.snapshot(() => state); } catch (e) { /* ignore */ } }
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();

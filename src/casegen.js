/*
 * ログは嘘をつかない — 問い合わせ票の自動生成
 * DBの実際のデータから、問い合わせ（答えが1つに決まるもの）を種類ごとに作る。
 * 正解・根拠の値・解説・模範SQLはすべてDBの値から組み立てるので、データと食い違わない。
 * データは乱数シード固定なので、誰が遊んでも同じ93件になる。
 */
(function (root) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sub = (pub) => `(SELECT user_id FROM usr_users WHERE public_id = '${pub}')`;
  const norm = (s) => String(s || '').normalize('NFKC').replace(/[\s#"'`,，]/g, '').toUpperCase();
  const numAccept = (...ids) => (v) => { const n = parseInt(norm(v).replace(/^(LOG_?ID|PRESENT_?ID|ID)[:=]?/, ''), 10); return ids.includes(n); };
  const strAccept = (...vals) => (v) => vals.map(norm).includes(norm(v));
  const md = (ts) => `${+ts.slice(5, 7)}月${+ts.slice(8, 10)}日`;
  const hm = (ts) => ts.slice(11, 16);
  const when = (ts) => `${md(ts)} ${hm(ts)}`;
  const num = (n) => Number(n).toLocaleString();
  const day = (ts) => ts.slice(0, 10);
  const WINDOW = "BETWEEN '2026-10-21 00:00:00' AND '2026-11-12 20:00:00'";
  // 元の7問のユーザーと、その関係者は使わない
  const EXCLUDE = ['U-38127', 'U-52904', 'U-27730', 'U-44590', 'U-73315', 'U-61458', 'U-90417', 'U-15562', 'U-31846'];

  function mulberry32(a) {
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function addMinutes(ts, m) { const d = new Date(ts.replace(' ', 'T') + 'Z'); d.setUTCMinutes(d.getUTCMinutes() + m); return d.toISOString().slice(0, 19).replace('T', ' '); }
  const CAP = '2026-11-13 09:45:00';
  // 出来事のあと、数時間〜1日半ほどして問い合わせが届く
  function receivedAfter(ts, k) { let r = addMinutes(ts, 90 + ((k * 137) % 2000)); if (r > CAP) r = CAP; return r.slice(0, 16); }

  function build(DB) {
    const rows = (sql) => { const r = DB.exec(sql); if (!r.length) return []; const cols = r[0].columns; return r[0].values.map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]]))); };
    const exIds = new Set(rows(`SELECT user_id FROM usr_users WHERE public_id IN (${EXCLUDE.map((p) => `'${p}'`).join(',')})`).map((r) => r.user_id));
    const used = new Set(exIds);
    const worldName = Object.fromEntries(rows('SELECT world_id, name FROM mst_worlds').map((r) => [r.world_id, r.name]));
    const mainWorld = (uid) => { const r = rows(`SELECT w.name FROM usr_characters c JOIN mst_worlds w USING (world_id) WHERE c.user_id = ${uid} AND c.deleted_at IS NULL ORDER BY c.level DESC LIMIT 1`); return r.length ? r[0].name : '（未記入）'; };
    // 候補を全期間からまんべんなく選び、同じユーザーは1回だけ使う
    function pick(cands, n) {
      const out = [];
      if (!cands.length) return out;
      const step = Math.max(1, Math.floor(cands.length / Math.max(1, n)));
      const order = [];
      for (let s = 0; s < step; s++) for (let i = s; i < cands.length; i += step) order.push(i);
      for (const i of order) { if (out.length >= n) break; const c = cands[i]; if (used.has(c.user_id)) continue; used.add(c.user_id); out.push(c); }
      return out;
    }

    let seq = 0;
    const LETTERS = ['a', 'b', 'c', 'd'];
    function mk(o) {
      seq++;
      // 選択肢の並びはケースごとに固定のシャッフル
      const all = [[o.correct, true], ...o.wrongs.map((w) => [w, false])];
      const r = mulberry32(seq * 7919 + 13);
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      return {
        id: `g${seq}`, generated: true, kind: o.kind, tier: o.tier,
        no: `CS-${o.received.slice(5, 7)}${o.received.slice(8, 10)}-${String(2000 + seq)}`,
        label: o.label, received: o.received, user: o.pub, world: o.world || '（未記入）', category: o.category,
        body: o.body, note: o.note,
        options: all.map((x, i) => [LETTERS[i], x[0]]), answer: LETTERS[all.findIndex((x) => x[1])],
        evidence: o.evidence, hints: o.hints, reply: o.reply, reaction: o.reaction, explain: o.explain, model: o.model,
        honest: o.honest, spec: o.spec !== false, temper: o.temper || 3,
      };
    }
    const vary = (arr, k) => arr[k % arr.length];

    // ======================================================================== Tier 1
    const T = {};
    T.sell = (n) => pick(rows(`
      SELECT e.log_id, e.user_id, u.public_id pub, e.equip_uid uid, e.created_at ts, m.name equip, c.name chara, w.name world, cur.log_id cur_id, cur.amount gold
      FROM log_equip e JOIN usr_users u ON u.user_id = e.user_id JOIN mst_equips m ON m.equip_id = e.equip_id
      LEFT JOIN usr_characters c ON c.character_id = e.character_id LEFT JOIN mst_worlds w ON w.world_id = c.world_id
      JOIN log_currency cur ON cur.user_id = e.user_id AND cur.reason = 'SELL_ITEM' AND cur.ref_id = e.equip_uid
      WHERE e.action = 'SELL' AND e.created_at ${WINDOW} AND m.rarity IN ('R', 'SR', 'SSR')
        AND (SELECT COUNT(*) FROM log_equip x WHERE x.user_id = e.user_id AND x.equip_id = e.equip_id AND x.action = 'SELL') = 1
        AND (SELECT COUNT(*) FROM usr_equips y WHERE y.user_id = e.user_id AND y.equip_id = e.equip_id) = 0
      ORDER BY e.log_id`), n).map((r, k) => mk({
      kind: 'sell', tier: 1, label: '装備消失', category: 'アイテム', pub: r.pub, world: r.world, temper: 3,
      received: receivedAfter(r.ts, r.log_id),
      body: vary([`『${r.equip}』が装備一覧から消えています。売った覚えはありません。不具合ですか？`, `大事にしていた『${r.equip}』がなくなりました。誰かに盗まれたんでしょうか。`, `『${r.equip}』がどこにもありません。倉庫も探しました。返してください。`], k),
      note: vary(['ユーザーは「売っていない」と強く主張しています。', '同じような報告は、ほかに届いていません。'], k),
      correct: '本人によるNPCショップへの売却', wrongs: ['強化の失敗による消滅', '他のプレイヤーへのトレード', '不具合による消失'],
      evidence: { label: '決め手になったログの log_id（log_equip）', placeholder: '例: 1234', table: 'log_equip', id: r.log_id, accept: numAccept(r.log_id) },
      hints: ['装備の名前は <code>mst_equips</code> にあります。equip_id を調べて、log_equip をユーザーと装備で絞り込みましょう。',
        '<code>ORDER BY created_at</code> で並べて、最後の action を見ましょう。',
        "売却なら log_currency に <code>reason = 'SELL_ITEM'</code> で、ref_id が装備の個体ID（equip_uid）の行があるはずです。"],
      reply: `お問い合わせありがとうございます。調査の結果、『${r.equip}』は${when(r.ts)}に、お客様のキャラクター『${r.chara}』からNPCショップへ売却され、${num(r.gold)}ゴールドを受け取られていることを確認いたしました。売却されたアイテムの復元は承っておりません。何卒ご理解ください。`,
      reaction: vary(['まとめて売ったときに、一緒に売っちゃってました……。', '整理したときにうっかり……。お騒がせしました。', 'ロックをかけ忘れてました。'], k),
      explain: `${when(r.ts)} に『${esc(r.chara)}』が『${esc(r.equip)}』（個体ID ${esc(r.uid)}）を売却しています（log_equip の <code>SELL</code>、log_id ${r.log_id}）。同じ時刻に log_currency に <code>SELL_ITEM</code> で ${num(r.gold)} ゴールドが入っていて、ref_id が同じ個体IDです。強化での消滅やトレードの記録はなく、<code>usr_equips</code> にも残っていません。`,
      model: `SELECT * FROM mst_equips WHERE name = '${r.equip}';

SELECT log_id, action, equip_uid, detail, created_at
FROM log_equip
WHERE user_id = ${sub(r.pub)}
  AND equip_id = (SELECT equip_id FROM mst_equips WHERE name = '${r.equip}')
ORDER BY created_at;

SELECT * FROM log_currency
WHERE user_id = ${sub(r.pub)} AND reason = 'SELL_ITEM' AND ref_id = '${r.uid}';`,
      honest: `ご自分で売っています。${num(r.gold)}ゴールドで。……安すぎませんか。`,
    }));

    T.expire = (n) => pick(rows(`
      SELECT i.log_id, i.user_id, u.public_id pub, i.created_at ts, m.name item, w.name world
      FROM log_item i JOIN usr_users u ON u.user_id = i.user_id JOIN mst_items m ON m.item_id = i.item_id
      LEFT JOIN usr_characters c ON c.character_id = i.character_id LEFT JOIN mst_worlds w ON w.world_id = c.world_id
      WHERE i.action = 'EXPIRE' AND i.created_at ${WINDOW}
        AND (SELECT COUNT(*) FROM log_item x WHERE x.user_id = i.user_id AND x.item_id = i.item_id AND x.action = 'EXPIRE') = 1
      ORDER BY i.log_id`), n).map((r, k) => {
      const dur = (r.item.match(/（(.+?)）/) || [])[1] || '期間限定';
      return mk({
        kind: 'expire', tier: 1, label: 'マウント消失', category: 'アイテム', pub: r.pub, world: r.world, temper: 3,
        received: receivedAfter(r.ts, r.log_id),
        body: vary([`『${r.item}』に乗れなくなりました！せっかく手に入れたのに、勝手に消えるなんておかしいです。`, `マウントの『${r.item}』がいなくなっています。どこに行ったんですか？`], k),
        note: 'マウントはイベントの報酬で配られたものです。',
        correct: '期限付きアイテムの期限切れ（仕様どおり）', wrongs: ['本人によるトレード', '本人による売却', '不具合による消失'],
        evidence: { label: '決め手になったログの log_id（log_item）', placeholder: '例: 1234', table: 'log_item', id: r.log_id, accept: numAccept(r.log_id) },
        hints: ['アイテム名は <code>mst_items</code> にあります。名前をよく見てみましょう。', 'log_item をそのユーザーとアイテムで絞り込み、action を確認しましょう。', '<code>EXPIRE</code> は有効期限が切れたことを表します。'],
        reply: `お問い合わせありがとうございます。調査の結果、『${r.item}』は期間限定のマウントで、${when(r.ts)}に有効期限を迎えたため、自動的に消滅していることを確認いたしました。仕様どおりの挙動となりますので、何卒ご理解ください。`,
        reaction: vary([`名前に（${dur}）って書いてありました……。`, '期限があるの、知りませんでした。'], k),
        explain: `『${esc(r.item)}』は名前のとおり期限付き（${esc(dur)}）のマウントです。log_item に ${when(r.ts)} の <code>EXPIRE</code>（期限切れ、log_id ${r.log_id}）があります。トレードや売却の記録はありません。`,
        model: `SELECT * FROM mst_items WHERE name = '${r.item}';

SELECT log_id, action, quantity, detail, created_at
FROM log_item
WHERE user_id = ${sub(r.pub)}
  AND item_id = (SELECT item_id FROM mst_items WHERE name = '${r.item}')
ORDER BY created_at;`,
        honest: `名前に「${dur}」って書いてあります。`,
      });
    });

    T.rename = (n) => pick(rows(`
      SELECT l.log_id, l.user_id, u.public_id pub, l.created_at ts, l.detail, c.name chara, w.name world, l.ip_address ip, l.device_id dev
      FROM log_character l JOIN usr_users u ON u.user_id = l.user_id JOIN usr_characters c ON c.character_id = l.character_id JOIN mst_worlds w ON w.world_id = c.world_id
      WHERE l.action = 'RENAME' AND l.created_at <= '2026-11-12 20:00:00' ORDER BY l.log_id`), n).map((r, k) => {
      const d = JSON.parse(r.detail);
      return mk({
        kind: 'rename', tier: 1, label: 'キャラ名変化', category: 'キャラクター', pub: r.pub, world: r.world, temper: 4,
        received: receivedAfter(r.ts, r.log_id),
        body: `キャラクター『${d.from}』がいなくなって、代わりに『${d.to}』という知らないキャラがいます！乗っ取られたんですか？`,
        note: 'ユーザーは「名前を変えた覚えはない」とのことです。',
        correct: '本人が名前変更チケットで名前を変えた（キャラクターは無事）', wrongs: ['第三者の不正ログインによる名前変更', 'キャラクターの削除と新規作成', '不具合による名前の書き換え'],
        evidence: { label: '決め手になったログの log_id（log_character）', placeholder: '例: 1234', table: 'log_character', id: r.log_id, accept: numAccept(r.log_id) },
        hints: ['usr_characters でそのユーザーのキャラを見てみましょう。', "log_character に <code>action = 'RENAME'</code> があれば、detail に変更前（from）と変更後（to）が入っています。", '操作元の ip_address・device_id を log_login の普段のログインと比べましょう。log_item には名前変更チケットの使用も残っています。'],
        reply: `お問い合わせありがとうございます。調査の結果、『${d.from}』は${when(r.ts)}に、お客様が普段ご利用の端末から名前変更チケットが使用され、『${d.to}』に名前が変更されていることを確認いたしました。キャラクターのデータはそのまま残っておりますのでご安心ください。`,
        reaction: vary(['……夜中に変えたのを思い出しました。', '弟が勝手に変えたみたいです。すみません。'], k),
        explain: `${when(r.ts)} に log_character の <code>RENAME</code>（log_id ${r.log_id}）があり、detail は <code>${esc(r.detail)}</code>。直前に log_item で名前変更チケット（1202）を使っています。操作元のIP（${esc(r.ip)}）・端末（${esc(r.dev)}）は普段のログインと同じです。キャラクターは別の名前で残っています。`,
        model: `SELECT * FROM usr_characters WHERE user_id = ${sub(r.pub)};

SELECT log_id, action, detail, ip_address, device_id, created_at
FROM log_character
WHERE user_id = ${sub(r.pub)}
ORDER BY created_at;

SELECT ip_address, device_id, COUNT(*) AS cnt
FROM log_login
WHERE user_id = ${sub(r.pub)}
GROUP BY ip_address, device_id;`,
        honest: `『${d.to}』も、あなたが自分で付けた名前です。`,
      });
    });

    const PAY_OPTS = ['正常に付与済み（ユーザーの見落とし）', '決済が完了していない（キャンセル）', '決済は完了したが、ジェムの付与に失敗している（補填対象）', '返金処理済み'];
    const others = (all, correct) => all.filter((x) => x !== correct);
    T.payOk = (n) => pick(rows(`
      SELECT p.payment_id, p.user_id, u.public_id pub, p.created_at ts, p.price_jpy price, p.transaction_id tx, p.store, pr.name prod, pr.gem, c.log_id cur_id,
        (SELECT -SUM(amount) FROM log_currency g WHERE g.user_id = p.user_id AND g.currency = 'GEM' AND g.reason = 'GACHA' AND g.created_at BETWEEN p.created_at AND datetime(p.created_at, '+2 days')) spent
      FROM log_payment p JOIN usr_users u ON u.user_id = p.user_id JOIN mst_products pr ON pr.product_id = p.product_id
      JOIN log_currency c ON c.ref_id = p.transaction_id AND c.reason = 'PURCHASE'
      WHERE p.status = 'SUCCESS' AND p.created_at ${WINDOW}
        AND (SELECT COUNT(*) FROM log_payment x WHERE x.user_id = p.user_id AND x.created_at BETWEEN datetime(p.created_at, '-1 day') AND datetime(p.created_at, '+1 day')) = 1
      ORDER BY p.payment_id`), n).map((r, k) => mk({
      kind: 'payok', tier: 1, label: '課金未反映', category: '課金', pub: r.pub, world: mainWorld(r.user_id), temper: 4,
      received: receivedAfter(r.ts, r.payment_id),
      body: `${md(r.ts)}に${num(r.price)}円の『${r.prod}』を買いましたが、ジェムが増えていません！${r.store}からは購入完了のメールが届いています。`,
      note: '課金関連です。補填が必要かどうかを明確にしてください。',
      correct: PAY_OPTS[0], wrongs: others(PAY_OPTS, PAY_OPTS[0]),
      evidence: { label: '該当する決済の transaction_id', placeholder: '例: GPA.0000-0000-0000-00000', accept: strAccept(r.tx), value: r.tx },
      hints: ['log_payment をそのユーザーで見てみましょう。status にも注目。', "SUCCESS なら、log_currency に <code>ref_id = transaction_id</code> の PURCHASE があるはずです。", 'その後、ジェムを何に使ったかも log_currency で確認しましょう。'],
      reply: `お問い合わせありがとうございます。調査の結果、${when(r.ts)}のご購入（取引ID: ${r.tx}）について、決済の完了と同時に${num(r.gem)}ジェムが付与されていることを確認いたしました。${r.spent ? `その後、ガチャで合計${num(r.spent)}ジェムをご利用いただいております。` : '現在の所持ジェムに含まれております。'}`,
      reaction: r.spent ? '……そのあと10連、回してました。' : 'ホーム画面の数字しか見てませんでした……。',
      explain: `log_payment の ${esc(r.tx)} は SUCCESS で、同時刻に log_currency に <code>PURCHASE</code> +${num(r.gem)}ジェム（ref_id が同じ取引ID、log_id ${r.cur_id}）があります。付与は正常です。${r.spent ? `その後2日以内に GACHA で合計 ${num(r.spent)} ジェムを使っていて、増えていないように見えたと考えられます。` : ''}`,
      model: `SELECT p.*, c.log_id AS grant_log_id, c.amount AS granted
FROM log_payment p
LEFT JOIN log_currency c
  ON c.ref_id = p.transaction_id AND c.reason = 'PURCHASE'
WHERE p.user_id = ${sub(r.pub)}
ORDER BY p.created_at;

SELECT log_id, amount, balance_after, reason, ref_id, created_at
FROM log_currency
WHERE user_id = ${sub(r.pub)} AND currency = 'GEM'
ORDER BY created_at;`,
      honest: r.spent ? `ちゃんと入っています。そして${num(r.spent)}ジェム、ガチャで溶かしています。` : 'ちゃんと入っています。残高の数字を見てください。',
    }));

    T.payCancel = (n) => pick(rows(`
      SELECT p.payment_id, p.user_id, u.public_id pub, p.created_at ts, p.price_jpy price, p.transaction_id tx, p.store
      FROM log_payment p JOIN usr_users u ON u.user_id = p.user_id
      WHERE p.status = 'CANCELED' AND p.created_at ${WINDOW}
        AND NOT EXISTS (SELECT 1 FROM log_payment x WHERE x.user_id = p.user_id AND x.status = 'SUCCESS' AND x.created_at BETWEEN datetime(p.created_at, '-1 day') AND datetime(p.created_at, '+1 day'))
      ORDER BY p.payment_id`), n).map((r) => mk({
      kind: 'paycancel', tier: 1, label: '課金未反映', category: '課金', pub: r.pub, world: mainWorld(r.user_id), temper: 3,
      received: receivedAfter(r.ts, r.payment_id),
      body: `${md(r.ts)}に${num(r.price)}円のジェムパックを買ったのに、ジェムが届きません！`,
      note: '課金関連です。補填が必要かどうかを明確にしてください。',
      correct: PAY_OPTS[1], wrongs: others(PAY_OPTS, PAY_OPTS[1]),
      evidence: { label: '該当する決済の transaction_id', placeholder: '例: GPA.0000-0000-0000-00000', accept: strAccept(r.tx), value: r.tx },
      hints: ['log_payment をそのユーザーで見てみましょう。status にも注目。', "SUCCESS なら、log_currency に <code>ref_id = transaction_id</code> の PURCHASE があるはずです。", 'CANCELED は決済が完了しなかったことを表します。'],
      reply: `お問い合わせありがとうございます。調査の結果、${when(r.ts)}のご購入手続き（取引ID: ${r.tx}）は決済が完了せず、キャンセルとなっておりました。そのためジェムは付与されておらず、ストアからの請求も発生しておりません。お手数ですが、改めてご購入ください。`,
      reaction: '確認画面で「戻る」を押してたかもしれません……。',
      explain: `log_payment の ${esc(r.tx)}（${when(r.ts)}）は status が <code>CANCELED</code> です。決済が完了していないため、log_currency に PURCHASE はなく、ストアからの請求も発生していません。`,
      model: `SELECT * FROM log_payment WHERE user_id = ${sub(r.pub)} ORDER BY created_at;

SELECT * FROM log_currency
WHERE ref_id = '${r.tx}';`,
      honest: '買えてません。最後のボタンまで押してください。',
    }));

    const BOX_OPTS = ['プレゼントBOXに届いている（まだ受け取っていない）', '受け取り済み'];
    T.loginBonus = (n) => pick(rows(`
      SELECT p.present_id, p.user_id, u.public_id pub, p.title, p.created_at ts, p.expires_at exp, p.quantity qty, p.present_type ptype, m.name item
      FROM usr_presents p JOIN usr_users u ON u.user_id = p.user_id LEFT JOIN mst_items m ON m.item_id = p.reward_id
      WHERE p.source = 'LOGIN_BONUS' AND p.received_at IS NULL AND p.created_at <= '2026-11-12 20:00:00'
      ORDER BY p.present_id`), n).map((r) => {
      const reward = r.ptype === 'GEM' ? `ジェム${r.qty}個` : `${r.item}×${r.qty}`;
      return mk({
        kind: 'loginbonus', tier: 1, label: 'ログボ未着', category: 'プレゼント', pub: r.pub, world: mainWorld(r.user_id), temper: 3,
        received: receivedAfter(r.ts, r.present_id),
        body: `ログインボーナスの「${r.title}」がもらえていません。ちゃんとログインしたのに！`,
        note: 'ログインボーナスはプレゼントBOXに届く仕組みです。',
        correct: BOX_OPTS[0], wrongs: [BOX_OPTS[1], 'ログインしていない日なので届いていない', '不具合で届いていない'],
        evidence: { label: '該当するプレゼントの present_id', placeholder: '例: 123', table: 'usr_presents', id: r.present_id, accept: numAccept(r.present_id) },
        hints: ['usr_presents をそのユーザーで見てみましょう。title で探せます。', 'received_at が NULL なら、まだ受け取っていません。', 'その日のログインは log_login で確認できます。'],
        reply: `お問い合わせありがとうございます。調査の結果、「${r.title}」（${reward}）は${when(r.ts)}にプレゼントBOXへお届けしております。まだお受け取りいただいていないようですので、プレゼントBOXからお受け取りください。受け取り期限は${md(r.exp)}までです。`,
        reaction: 'プレゼントBOX、開いてませんでした……！',
        explain: `usr_presents に「${esc(r.title)}」（present_id ${r.present_id}、${esc(reward)}）が ${when(r.ts)} に届いていて、received_at は NULL（未受け取り）です。その日最初のログインの直後に届いています。期限は ${day(r.exp)} まで。`,
        model: `SELECT * FROM usr_presents
WHERE user_id = ${sub(r.pub)}
ORDER BY created_at;`,
        honest: 'プレゼントBOXを、開いてください。',
      });
    });

    T.maint = (n) => {
      const cands = rows(`
        SELECT p.present_id, p.user_id, u.public_id pub, p.created_at ts, p.received_at recv, p.expires_at exp, c.log_id cur_id
        FROM usr_presents p JOIN usr_users u ON u.user_id = p.user_id
        LEFT JOIN log_currency c ON c.user_id = p.user_id AND c.reason = 'PRESENT' AND c.ref_id = 'present:' || p.present_id
        WHERE p.source = 'MAINTENANCE' AND (p.received_at IS NULL OR p.received_at <= '2026-11-12 20:00:00') ORDER BY p.present_id`);
      const nUn = Math.min(3, Math.floor(n / 2) + 1);
      const picked = [...pick(cands.filter((r) => r.recv == null), nUn), ...pick(cands.filter((r) => r.recv != null), n - nUn)];
      const opts = [...BOX_OPTS, '配布の対象外', '不具合で届いていない'];
      return picked.map((r, k) => {
        const got = r.recv != null;
        const base = got ? r.recv : '2026-11-08 12:00:00';
        return mk({
          kind: 'maint', tier: 1, label: 'お詫び未着', category: 'プレゼント', pub: r.pub, world: mainWorld(r.user_id), temper: 4,
          received: receivedAfter(base, r.present_id + k),
          body: vary(['メンテナンスのお詫びの300ジェム、まだもらってません！ほかの人はもらってるのに！', 'お詫びのジェムが届いていません。私は対象外なんですか？'], k),
          note: '11/6 の臨時メンテナンスのお詫び（300ジェム）は、対象のユーザー全員にプレゼントBOXで配布済みです。',
          correct: got ? BOX_OPTS[1] : BOX_OPTS[0], wrongs: others(opts, got ? BOX_OPTS[1] : BOX_OPTS[0]),
          evidence: { label: '該当するプレゼントの present_id', placeholder: '例: 123', table: 'usr_presents', id: r.present_id, accept: numAccept(r.present_id) },
          hints: ['usr_presents を source や title で探しましょう。', 'received_at が入っていれば受け取り済み、NULL なら未受け取りです。', "受け取ったジェムは log_currency に <code>reason = 'PRESENT'</code>、ref_id = present:〜 で記録されます。"],
          reply: got ? `お問い合わせありがとうございます。調査の結果、お詫びの300ジェムは${when(r.recv)}にお受け取りいただいていることを確認いたしました。現在の所持ジェムに含まれております。`
            : `お問い合わせありがとうございます。調査の結果、お詫びの300ジェムはプレゼントBOXにお届けしております。受け取り期限（${md(r.exp)}）までにお受け取りください。`,
          reaction: got ? 'あれ、もらってました。もう使っちゃってたみたいです。' : 'BOXにありました！ありがとうございます。',
          explain: got ? `usr_presents の「11/6 臨時メンテナンスのお詫び」（present_id ${r.present_id}）は ${when(r.recv)} に受け取られていて、log_currency に <code>PRESENT</code> +300（ref_id = present:${r.present_id}、log_id ${r.cur_id}）があります。`
            : `usr_presents の「11/6 臨時メンテナンスのお詫び」（present_id ${r.present_id}）は received_at が NULL で、まだ受け取っていません。log_currency にも PRESENT はありません。`,
          model: `SELECT * FROM usr_presents
WHERE user_id = ${sub(r.pub)} AND source = 'MAINTENANCE';

SELECT * FROM log_currency
WHERE user_id = ${sub(r.pub)} AND reason = 'PRESENT';`,
          honest: got ? '受け取っています。そして、たぶんもう使っています。' : 'プレゼントBOXを開いてください。',
        });
      });
    };

    // ======================================================================== Tier 2
    const GOLD_OPTS = { GUILD_DONATE: '本人の操作によるギルドへの寄付', AUCTION_BUY: '本人の操作によるオークションでの購入' };
    T.gold = (n) => {
      const q = (reason) => rows(`
        SELECT c.log_id, c.user_id, u.public_id pub, c.created_at ts, -c.amount amt, c.reason, c.ref_id ref,
          (SELECT l.ip_address FROM log_login l WHERE l.user_id = c.user_id AND l.result = 'SUCCESS' AND l.created_at <= c.created_at ORDER BY l.created_at DESC LIMIT 1) ip,
          (SELECT l.device_id FROM log_login l WHERE l.user_id = c.user_id AND l.result = 'SUCCESS' AND l.created_at <= c.created_at ORDER BY l.created_at DESC LIMIT 1) dev,
          (SELECT l.created_at FROM log_login l WHERE l.user_id = c.user_id AND l.result = 'SUCCESS' AND l.created_at <= c.created_at ORDER BY l.created_at DESC LIMIT 1) login_at
        FROM log_currency c JOIN usr_users u ON u.user_id = c.user_id
        WHERE c.currency = 'GOLD' AND c.reason = '${reason}' AND c.amount <= -500000 AND c.created_at ${WINDOW}
          AND (SELECT COUNT(*) FROM log_currency x WHERE x.user_id = c.user_id AND x.currency = 'GOLD' AND x.amount <= -200000 AND date(x.created_at) = date(c.created_at)) = 1
        ORDER BY c.log_id`).filter((r) => r.login_at);
      const half = Math.ceil(n / 2);
      return [...pick(q('GUILD_DONATE'), half), ...pick(q('AUCTION_BUY'), n - half)].map((r, k) => {
        const donate = r.reason === 'GUILD_DONATE';
        return mk({
          kind: 'gold', tier: 2, label: 'ゴールド減少', category: 'ゲーム内通貨', pub: r.pub, world: mainWorld(r.user_id), temper: 4,
          received: receivedAfter(r.ts, r.log_id),
          body: `${md(r.ts)}の${+r.ts.slice(11, 13)}時ごろ、ゴールドが${num(r.amt)}も減っていました。使った覚えはありません。乗っ取りですか？`,
          note: vary(['ユーザーはスマホ1台で遊んでいるそうです。', 'パスワードは誰にも教えていないとのことです。'], k),
          correct: GOLD_OPTS[r.reason], wrongs: [GOLD_OPTS[donate ? 'AUCTION_BUY' : 'GUILD_DONATE'], '本人の操作によるショップでの購入', '第三者の不正ログインによる消費'],
          evidence: { label: '決め手になったログの log_id（log_currency）', placeholder: '例: 1234', table: 'log_currency', id: r.log_id, accept: numAccept(r.log_id) },
          hints: [`log_currency をそのユーザーの <code>currency = 'GOLD'</code> と日付（${day(r.ts)}）で絞り込みましょう。`, 'amount の大きなマイナスと、reason・ref_id に注目。', 'その直前のログインを log_login で見て、普段の端末・IPか確かめましょう。'],
          reply: donate ? `お問い合わせありがとうございます。調査の結果、${when(r.ts)}に、お客様が普段ご利用の端末から、ギルドへ${num(r.amt)}ゴールドを寄付する操作が行われていたことを確認いたしました。第三者によるログインの形跡はございません。`
            : `お問い合わせありがとうございます。調査の結果、${when(r.ts)}に、お客様が普段ご利用の端末から、オークションで${num(r.amt)}ゴールドの落札が行われていたことを確認いたしました。第三者によるログインの形跡はございません。`,
          reaction: donate ? 'ギルドのみんなに頼まれて、つい……。' : '夜中に入札したのを思い出しました……。',
          explain: `${when(r.ts)} に log_currency で <code>${r.reason}</code>（ref_id ${esc(r.ref)}）の −${num(r.amt)} ゴールド（log_id ${r.log_id}）。直前のログイン（${when(r.login_at)}）は ${esc(r.ip)}・${esc(r.dev)} からで、普段と同じ端末・IPです。不正ログインの形跡はありません。`,
          model: `SELECT log_id, amount, balance_after, reason, ref_id, created_at
FROM log_currency
WHERE user_id = ${sub(r.pub)}
  AND currency = 'GOLD'
  AND date(created_at) = '${day(r.ts)}'
ORDER BY created_at;

SELECT log_id, result, ip_address, device_id, created_at
FROM log_login
WHERE user_id = ${sub(r.pub)}
ORDER BY created_at DESC
LIMIT 20;`,
          honest: donate ? 'ご自分で寄付しています。ギルドの皆さんは喜んでいると思います。' : 'ご自分で落札しています。いい買い物でしたか？',
        });
      });
    };

    T.loginFail = (n) => pick(rows(`
      SELECT f.log_id fail_id, f.user_id, u.public_id pub, f.created_at ts, f.ip_address ip, f.device_id dev,
        (SELECT s.log_id FROM log_login s WHERE s.user_id = f.user_id AND s.result = 'SUCCESS' AND s.ip_address = f.ip_address AND s.device_id = f.device_id AND s.created_at > f.created_at ORDER BY s.created_at LIMIT 1) ok_id,
        (SELECT s.created_at FROM log_login s WHERE s.user_id = f.user_id AND s.result = 'SUCCESS' AND s.ip_address = f.ip_address AND s.device_id = f.device_id AND s.created_at > f.created_at ORDER BY s.created_at LIMIT 1) ok_at,
        (SELECT COUNT(*) FROM log_login z WHERE z.user_id = f.user_id AND z.ip_address = f.ip_address AND z.result = 'SUCCESS') usual
      FROM log_login f JOIN usr_users u ON u.user_id = f.user_id
      WHERE f.result = 'FAILED' AND f.created_at ${WINDOW}
        AND (SELECT COUNT(*) FROM log_login y WHERE y.user_id = f.user_id AND y.result = 'FAILED') = 1
      ORDER BY f.log_id`).filter((r) => r.ok_at && r.ok_at <= addMinutes(r.ts, 5) && r.usual >= 3), n).map((r, k) => {
      const secs = Math.round((new Date(r.ok_at.replace(' ', 'T') + 'Z') - new Date(r.ts.replace(' ', 'T') + 'Z')) / 1000);
      return mk({
        kind: 'loginfail', tier: 2, label: 'ログイン失敗', category: 'アカウント', pub: r.pub, world: mainWorld(r.user_id), temper: 4,
        received: receivedAfter(r.ts, r.fail_id),
        body: `${md(r.ts)}に「ログインに失敗しました」という通知が届きました。誰かが私のアカウントに入ろうとしているんですか？怖いです。`,
        note: vary(['ユーザーはかなり不安がっています。', 'セキュリティの問い合わせです。'], k),
        correct: '本人のパスワード入力ミス（直後に同じ端末・IPでログインに成功している）', wrongs: ['第三者による不正ログインの試み', 'サーバー障害によるログインエラー', '第三者にログインされている（乗っ取り）'],
        evidence: { label: '決め手になったログの log_id（log_login）', placeholder: '例: 1234', table: 'log_login', id: r.ok_id, accept: numAccept(r.fail_id, r.ok_id) },
        hints: ['log_login をそのユーザーで見てみましょう。result が FAILED の行を探します。', 'FAILED の前後で、ip_address・device_id・country を比べましょう。', 'そのIP・端末から、普段ログインしているかも数えてみましょう。'],
        reply: `お問い合わせありがとうございます。調査の結果、${when(r.ts)}のログイン失敗は、お客様が普段ご利用の端末からのもので、直後に同じ端末でログインに成功していることを確認いたしました。パスワードの入力ミスと考えられます。ご心配でしたら、パスワードの変更をおすすめいたします。`,
        reaction: 'パスワード、一回打ち間違えたの思い出しました。',
        explain: `${when(r.ts)} に ${esc(r.ip)}・${esc(r.dev)} から FAILED（log_id ${r.fail_id}）。${secs}秒後に同じIP・端末で SUCCESS（log_id ${r.ok_id}）。このIPからは普段から ${r.usual} 回ログインしていて、海外や見慣れない端末からの失敗はありません。`,
        model: `SELECT log_id, result, ip_address, country, device_id, created_at
FROM log_login
WHERE user_id = ${sub(r.pub)}
  AND date(created_at) = '${day(r.ts)}'
ORDER BY created_at;

SELECT ip_address, device_id, result, COUNT(*) AS cnt
FROM log_login
WHERE user_id = ${sub(r.pub)}
GROUP BY ip_address, device_id, result;`,
        honest: 'それ、あなたです。',
      });
    });

    const UNIT = { LOGIN: '日', STAGE_CLEAR: '回', RAID_CLEAR: '回', GACHA_DRAW: '回', ENHANCE_SUCCESS: '回', GUILD_DONATE: 'ゴールド', CHARACTER_CREATE: '体' };
    const PERIOD = { DAILY: '今日（11/13）の分だけを数えます。', WEEKLY: '今週（11/9 月曜〜）の分だけを数えます。', EVENT: 'イベント期間中の分だけを数えます。', BEGINNER: '' };
    const MIS_OPTS = ['達成済みで、報酬をまだ受け取っていない', 'ミッションをまだ達成していない', '報酬は受け取り済み', '不具合で進み具合が数えられていない'];
    T.mission = (n) => {
      const all = rows(`
        SELECT um.user_id, u.public_id pub, um.mission_id mid, m.name, m.mission_type mtype, m.condition_type ctype, m.condition_value target,
          um.progress, um.cleared_at cleared, um.received_at recv, um.updated_at upd, m.reward_type rtype, m.reward_quantity rqty, i.name item
        FROM usr_missions um JOIN usr_users u ON u.user_id = um.user_id JOIN mst_missions m ON m.mission_id = um.mission_id
        LEFT JOIN mst_items i ON i.item_id = m.reward_id
        ORDER BY um.mission_id, um.user_id`);
      const half = Math.ceil(n / 2);
      const unrecv = pick(all.filter((r) => r.cleared && !r.recv && r.cleared <= '2026-11-13 09:00:00'), half);
      const notyet = pick(all.filter((r) => !r.cleared && r.target > 1 && r.progress >= r.target / 2 && r.mtype !== 'DAILY'), n - unrecv.length);
      return [...unrecv, ...notyet].map((r, k) => {
        const done = !!r.cleared;
        const reward = r.rtype === 'GEM' ? `ジェム${r.rqty}個` : `${r.item}×${r.rqty}`;
        const left = r.target - r.progress, unit = UNIT[r.ctype];
        return mk({
          kind: 'mission', tier: 2, label: 'ミッション', category: 'ミッション', pub: r.pub, world: mainWorld(r.user_id), temper: 3,
          received: receivedAfter(done ? r.cleared : r.upd, r.user_id * 31 + r.mid),
          body: done ? `ミッション「${r.name}」を達成したのに、報酬がもらえていません！` : `ミッション「${r.name}」をクリアしたはずなのに、達成になりません。不具合ですか？`,
          note: 'ミッションの報酬は、ミッション画面の「受け取る」で受け取る仕組みです。',
          correct: MIS_OPTS[done ? 0 : 1], wrongs: others(MIS_OPTS, MIS_OPTS[done ? 0 : 1]),
          evidence: { label: 'usr_missions の progress の値', placeholder: '例: 3', value: String(r.progress), accept: numAccept(r.progress) },
          hints: ['ミッション名は mst_missions にあります。mission_id と、達成に必要な数（condition_value）を確認しましょう。', 'usr_missions でそのユーザーの進み具合（progress）を見ます。', 'cleared_at が入っていれば達成済み、received_at が入っていれば受け取り済みです。'],
          reply: done ? `お問い合わせありがとうございます。調査の結果、ミッション「${r.name}」は${when(r.cleared)}に達成されております。報酬（${reward}）は、ミッション画面の「受け取る」からお受け取りください。`
            : `お問い合わせありがとうございます。調査の結果、ミッション「${r.name}」の進み具合は${num(r.progress)}／${num(r.target)}で、まだ達成されておりません。あと${num(left)}${unit}で達成となります。`,
          reaction: done ? '受け取るボタン、押してませんでした。' : '数え間違えてました……。',
          explain: done ? `mst_missions で「${esc(r.name)}」は mission_id ${r.mid}、必要数 ${num(r.target)}。usr_missions の progress は ${num(r.progress)} で、${when(r.cleared)} に達成（cleared_at）。received_at は NULL なので、報酬（${esc(reward)}）をまだ受け取っていません。`
            : `mst_missions で「${esc(r.name)}」は mission_id ${r.mid}、必要数 ${num(r.target)}。usr_missions の progress は ${num(r.progress)} で、あと ${num(left)}${unit} 足りません。${PERIOD[r.mtype]}cleared_at も NULL です。`,
          model: `SELECT * FROM mst_missions WHERE name = '${r.name}';

SELECT * FROM usr_missions
WHERE user_id = ${sub(r.pub)}
  AND mission_id = ${r.mid};`,
          honest: done ? '「受け取る」を押してください。' : `あと${num(left)}${unit}です。数えてください。`,
        });
      });
    };

    T.ceiling = (n) => pick(rows(`
      SELECT g.user_id, u.public_id pub, g.gacha_id gid, mg.name gname, g.draw_count draws, g.updated_at ts, c.ceiling_count cc,
        (SELECT MAX(required_count) FROM mst_gacha_ceilings m WHERE m.gacha_id = g.gacha_id) req
      FROM usr_gachas g JOIN usr_users u ON u.user_id = g.user_id JOIN usr_gacha_ceilings c ON c.user_id = g.user_id AND c.gacha_id = g.gacha_id
      JOIN mst_gachas mg ON mg.gacha_id = g.gacha_id
      WHERE g.draw_count >= 20 AND g.updated_at <= '2026-11-12 22:00:00'
      ORDER BY g.draw_count DESC, g.user_id`), n).map((r) => mk({
      kind: 'ceiling', tier: 2, label: '天井', category: 'ガチャ', pub: r.pub, world: mainWorld(r.user_id), temper: 4,
      received: receivedAfter(r.ts, r.user_id),
      body: `「${r.gname}」をもう${r.draws}回も回しています。天井で交換できるはずなのに、交換できません！`,
      note: 'ガチャの天井は交換型です（1回まわすごとに1ポイント）。',
      correct: '天井ポイントが必要数に届いていない（まだ交換できない）', wrongs: ['天井に届いていて、すでに交換できる', '天井ポイントがリセットされている', 'このガチャには天井がない'],
      evidence: { label: 'あと何回まわせば交換できるか（回数）', placeholder: '例: 30', value: String(r.req - r.cc), accept: numAccept(r.req - r.cc) },
      hints: ['ガチャ名は mst_gachas、天井の必要数は mst_gacha_ceilings にあります。', 'usr_gacha_ceilings で、そのユーザーのポイント（ceiling_count）を見ましょう。', '必要数からポイントを引くと、あと何回か分かります。'],
      reply: `お問い合わせありがとうございます。調査の結果、「${r.gname}」の天井ポイントは現在${r.cc}で、交換には${r.req}ポイントが必要です。あと${r.req - r.cc}回まわしていただくと、交換が可能になります。`,
      reaction: `天井って${r.req}回だったんですね……遠い。`,
      explain: `mst_gacha_ceilings で「${esc(r.gname)}」の天井は ${r.req} 回。usr_gacha_ceilings の ceiling_count は ${r.cc}（usr_gachas の draw_count ${r.draws} と同じで、リセットはされていません）。あと ${r.req - r.cc} 回で交換できます。`,
      model: `SELECT * FROM mst_gacha_ceilings
WHERE gacha_id = (SELECT gacha_id FROM mst_gachas WHERE name = '${r.gname}');

SELECT * FROM usr_gacha_ceilings WHERE user_id = ${sub(r.pub)};
SELECT * FROM usr_gachas WHERE user_id = ${sub(r.pub)};`,
      honest: `あと${r.req - r.cc}回です。……やめておいたほうがいいと思います。`,
    }));

    T.noSsr = (n) => pick(rows(`
      SELECT g.currency_log_id cur_id, g.user_id, u.public_id pub, MIN(g.created_at) ts, g.gacha_id gid, mg.name gname, SUM(g.rarity = 'SR') sr
      FROM log_gacha g JOIN usr_users u ON u.user_id = g.user_id JOIN mst_gachas mg ON mg.gacha_id = g.gacha_id
      WHERE g.created_at ${WINDOW}
      GROUP BY g.currency_log_id HAVING COUNT(*) = 10 AND SUM(g.rarity = 'SSR') = 0
        AND (SELECT COUNT(*) FROM log_currency x WHERE x.user_id = g.user_id AND x.reason = 'GACHA' AND x.amount = -3000 AND date(x.created_at) = date(MIN(g.created_at))) = 1
      ORDER BY g.currency_log_id`), n).map((r) => mk({
      kind: 'nossr', tier: 2, label: 'ガチャ確率', category: 'ガチャ', pub: r.pub, world: mainWorld(r.user_id), temper: 5,
      received: receivedAfter(r.ts, r.cur_id),
      body: `${md(r.ts)}に「${r.gname}」で10連を回したのに、SSRが1枚も出ませんでした。確率がおかしくないですか？`,
      note: '確率についての苦情です。データにもとづいて回答してください。',
      correct: '表示どおりの確率による結果（不具合ではない）', wrongs: ['排出確率の設定ミス（SSRが出ない状態）', 'ジェムだけ消費されて、ガチャが回っていない', '10連のSSR確定枠の不具合'],
      evidence: { label: 'その10連でジェムを払ったログの log_id（log_currency）', placeholder: '例: 1234', table: 'log_currency', id: r.cur_id, accept: numAccept(r.cur_id) },
      hints: [`log_currency で ${day(r.ts)} の <code>reason = 'GACHA'</code> を探しましょう。amount −3000 が10連です。`, 'log_gacha の currency_log_id が、そのジェム消費の log_id と一致する行を数えましょう。', 'mst_gacha_lineups で SSR の rate を合計してみましょう（千分率）。'],
      reply: `お問い合わせありがとうございます。調査の結果、${when(r.ts)}の10連（${r.gname}）は正常に実行され、10回分の結果をお受け取りいただいております。SSRの排出確率は1回あたり3%で、設定どおりの結果でございます。`,
      reaction: '74%……そんなに出ないものなんですね。',
      explain: `${when(r.ts)} の log_currency に GACHA −3,000（log_id ${r.cur_id}）があり、それに対応する log_gacha（currency_log_id = ${r.cur_id}）は10行。SSRは0枚、SRは${r.sr}枚でした。mst_gacha_lineups の SSR は合計30（千分率で3%）なので、10回すべてSSR以外になる確率は 0.97 の10乗 ≒ 74%。SSR確定枠はなく、設定どおりの結果です。`,
      model: `SELECT log_id, amount, ref_id, created_at
FROM log_currency
WHERE user_id = ${sub(r.pub)}
  AND reason = 'GACHA'
  AND date(created_at) = '${day(r.ts)}';

SELECT rarity, COUNT(*) AS cnt
FROM log_gacha
WHERE currency_log_id = ${r.cur_id}
GROUP BY rarity;

SELECT rarity, SUM(rate) AS rate_permil
FROM mst_gacha_lineups
WHERE gacha_id = '${r.gid}'
GROUP BY rarity;`,
      honest: '確率3%です。そういうものです。',
    }));

    T.trade = (n) => pick(rows(`
      SELECT o.log_id out_id, o.user_id, u.public_id pub, o.created_at ts, m.name item, o.quantity q, o.target_user_id tuid, tu.public_id tpub,
        i.log_id in_id, tc.name tchar, w.name world
      FROM log_item o JOIN usr_users u ON u.user_id = o.user_id JOIN mst_items m ON m.item_id = o.item_id JOIN usr_users tu ON tu.user_id = o.target_user_id
      JOIN log_item i ON i.user_id = o.target_user_id AND i.action = 'TRADE_IN' AND i.target_user_id = o.user_id AND i.item_id = o.item_id AND i.created_at = o.created_at
      LEFT JOIN usr_characters tc ON tc.character_id = i.character_id
      LEFT JOIN usr_characters c ON c.character_id = o.character_id LEFT JOIN mst_worlds w ON w.world_id = c.world_id
      WHERE o.action = 'TRADE_OUT' AND o.created_at ${WINDOW} AND tc.name IS NOT NULL
        AND (SELECT COUNT(*) FROM log_item x WHERE x.user_id = o.user_id AND x.action = 'TRADE_OUT' AND x.item_id = o.item_id AND date(x.created_at) = date(o.created_at)) = 1
      ORDER BY o.log_id`), n).map((r) => mk({
      kind: 'trade', tier: 2, label: 'トレード未着', category: 'アイテム', pub: r.pub, world: r.world, temper: 2,
      received: receivedAfter(r.ts, r.out_id),
      body: `${md(r.ts)}にフレンドの『${r.tchar}』へ『${r.item}』を${r.q}個トレードしたのに、「届いていない」と言われました。アイテムはどこに消えたんですか？`,
      note: 'トレード相手もこのゲームのユーザーです。',
      correct: '相手に届いている（相手側に受け取りの記録がある）', wrongs: ['トレードが失敗して、アイテムは手元に戻った', '別のプレイヤーに送っていた', '不具合でアイテムが消えた'],
      evidence: { label: '決め手になったログの log_id（log_item）', placeholder: '例: 1234', table: 'log_item', id: r.in_id, accept: numAccept(r.in_id) },
      hints: ["log_item でそのユーザーの <code>action = 'TRADE_OUT'</code> を探しましょう。", 'target_user_id は相手の user_id。相手側の log_item に TRADE_IN があるか見てみましょう。', '同じ時刻・同じアイテムの TRADE_IN が、受け取りの記録です。'],
      reply: `お問い合わせありがとうございます。調査の結果、${when(r.ts)}にお客様から『${r.tchar}』様へ『${r.item}』×${r.q}がトレードされ、相手の方が受け取られていることを確認いたしました。お相手の方に、持ち物をご確認いただくようお伝えください。`,
      reaction: 'フレンドに確認したら、ありました！もう使ってたみたいです。',
      explain: `log_item の TRADE_OUT（${when(r.ts)}、log_id ${r.out_id}）の target_user_id は ${esc(r.tpub)}（user_id ${r.tuid}）。同じ時刻に ${esc(r.tpub)} 側に TRADE_IN（log_id ${r.in_id}、キャラ『${esc(r.tchar)}』）があります。アイテムは相手に届いています。`,
      model: `SELECT log_id, item_id, quantity, target_user_id, detail, created_at
FROM log_item
WHERE user_id = ${sub(r.pub)}
  AND action = 'TRADE_OUT'
  AND date(created_at) = '${day(r.ts)}';

SELECT log_id, user_id, item_id, quantity, target_user_id, created_at
FROM log_item
WHERE user_id = ${r.tuid}
  AND action = 'TRADE_IN'
  AND target_user_id = ${sub(r.pub)};`,
      honest: '届いています。ご友人に、もう一度よく探すように言ってください。',
    }));

    // ======================================================================== Tier 3
    T.del = (n) => pick(rows(`
      SELECT l.log_id, l.user_id, u.public_id pub, l.created_at ts, c.name chara, c.level, w.name world, l.ip_address ip, l.device_id dev
      FROM log_character l JOIN usr_users u ON u.user_id = l.user_id JOIN usr_characters c ON c.character_id = l.character_id JOIN mst_worlds w ON w.world_id = c.world_id
      WHERE l.action = 'DELETE' AND l.created_at ${WINDOW} AND c.deleted_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM log_character r WHERE r.character_id = l.character_id AND r.action = 'RESTORE')
      ORDER BY l.log_id`), n).map((r, k) => mk({
      kind: 'delete', tier: 3, label: 'キャラ消失', category: 'キャラクター', pub: r.pub, world: r.world, temper: 5,
      received: receivedAfter(r.ts, r.log_id),
      body: vary([`キャラクター『${r.chara}』（Lv${r.level}）がいなくなりました！何もしていません！すぐに戻してください！`, `『${r.chara}』がキャラ一覧から消えました。運営のミスですよね？`], k),
      note: 'ユーザーはかなりお怒りです。まずは事実確認をお願いします。',
      correct: '本人の操作による削除（普段と同じ端末・IPから実行）', wrongs: ['第三者の不正ログインによる削除', 'サーバー不具合によるデータ消失', 'キャラクターは消えていない（表示の問題）'],
      evidence: { label: '決め手になったログの log_id（log_character）', placeholder: '例: 1234', table: 'log_character', id: r.log_id, accept: numAccept(r.log_id) },
      hints: ['usr_characters でそのユーザーのキャラを確認しましょう。<code>deleted_at</code> に日時が入っていれば削除済みです。', "log_character で <code>action = 'DELETE'</code> を探し、detail を見ましょう。", 'DELETE の ip_address と device_id を、log_login の普段のログインと比べましょう。'],
      reply: `お問い合わせありがとうございます。調査の結果、『${r.chara}』は${when(r.ts)}に、お客様が普段ご利用の端末から、キャラクター名の入力確認を経て削除されていることを確認いたしました。削除から30日以内のため、復旧申請が可能です。`,
      reaction: vary(['サブキャラと間違えて消してました……。復旧申請します。', '……消しました。寝ぼけてました。'], k),
      explain: `usr_characters の deleted_at が ${when(r.ts)}。log_character に同時刻の DELETE（log_id ${r.log_id}）があり、detail に <code>confirm: name_input</code>（キャラ名を入力しての確認）。操作元のIP（${esc(r.ip)}）・端末（${esc(r.dev)}）は普段のログインと同じです。`,
      model: `SELECT * FROM usr_characters WHERE user_id = ${sub(r.pub)};

SELECT log_id, action, detail, ip_address, device_id, created_at
FROM log_character
WHERE user_id = ${sub(r.pub)} AND action = 'DELETE';

SELECT ip_address, device_id, COUNT(*) AS cnt
FROM log_login
WHERE user_id = ${sub(r.pub)}
GROUP BY ip_address, device_id;`,
      honest: '名前を手で打ち込んでまで、ご自分で消しています。',
    }));

    T.restore = (n) => pick(rows(`
      SELECT r.log_id, r.user_id, u.public_id pub, r.created_at ts, d.created_at del_at, d.log_id del_id, c.name chara, w.name world
      FROM log_character r JOIN usr_users u ON u.user_id = r.user_id
      JOIN log_character d ON d.character_id = r.character_id AND d.action = 'DELETE' AND d.created_at < r.created_at
      JOIN usr_characters c ON c.character_id = r.character_id JOIN mst_worlds w ON w.world_id = c.world_id
      WHERE r.action = 'RESTORE' AND r.created_at <= '2026-11-12 20:00:00'
      ORDER BY r.log_id`), n).map((r) => mk({
      kind: 'restore', tier: 3, label: 'キャラ復活', category: 'キャラクター', pub: r.pub, world: r.world, temper: 3,
      received: receivedAfter(r.ts, r.log_id),
      body: `消したはずのキャラクター『${r.chara}』が、いつの間にか戻っています。気味が悪いです。誰かが勝手に操作していませんか？`,
      note: 'セキュリティの不安についての問い合わせです。',
      correct: 'CSへの依頼にもとづく、運営の復旧対応', wrongs: ['第三者の不正ログインによる操作', '不具合による復活', '本人がキャラクターを作り直した'],
      evidence: { label: '決め手になったログの log_id（log_character）', placeholder: '例: 1234', table: 'log_character', id: r.log_id, accept: numAccept(r.log_id) },
      hints: ['log_character でそのキャラの action を時系列で見ましょう。', 'RESTORE の detail に、誰が戻したかが書いてあります。', 'ip_address・device_id が NULL なのは、ユーザーの端末からの操作ではないということです。'],
      reply: `お問い合わせありがとうございます。調査の結果、『${r.chara}』は${when(r.del_at)}に削除された後、${when(r.ts)}にカスタマーサポートへの復旧依頼にもとづいて復旧されております。第三者による操作ではございませんので、ご安心ください。`,
      reaction: '……そういえば、消した直後にCSに泣きついてました。忘れてました。',
      explain: `${when(r.del_at)} に DELETE（log_id ${r.del_id}）、${when(r.ts)} に RESTORE（log_id ${r.log_id}）。RESTORE の detail は <code>by: cs_ticket</code>（CSへの問い合わせにもとづく復旧）で、ip_address・device_id は NULL（ユーザーの端末ではなく、運営側の操作）です。`,
      model: `SELECT log_id, character_id, action, detail, ip_address, device_id, created_at
FROM log_character
WHERE user_id = ${sub(r.pub)}
ORDER BY created_at;`,
      honest: 'ご自分でCSに「戻してください」と頼んでいます。',
    }));

    T.world = (n) => pick(rows(`
      SELECT l.log_id, l.user_id, u.public_id pub, l.created_at ts, l.detail, c.name chara, c.world_id now_w
      FROM log_character l JOIN usr_users u ON u.user_id = l.user_id JOIN usr_characters c ON c.character_id = l.character_id
      WHERE l.action = 'WORLD_TRANSFER' AND l.created_at <= '2026-11-12 20:00:00' ORDER BY l.log_id`), n).map((r) => {
      const d = JSON.parse(r.detail);
      const from = worldName[d.from_world], to = worldName[d.to_world];
      return mk({
        kind: 'world', tier: 3, label: 'キャラ不在', category: 'キャラクター', pub: r.pub, world: from, temper: 4,
        received: receivedAfter(r.ts, r.log_id),
        body: `キャラクター『${r.chara}』が${from}のキャラ一覧から消えています！削除なんてしていません！`,
        note: `ユーザーは「${from}」で遊んでいるとのことです。`,
        correct: '本人の操作によるワールド移動（キャラクターは無事）', wrongs: ['本人の操作による削除', '本人の操作による名前変更', '不具合によるキャラクターの消失'],
        evidence: { label: `『${r.chara}』が今いるワールド名`, placeholder: '例: ベータ', value: to, accept: (v) => { const x = norm(v); return x.includes(norm(to)) || x === String(d.to_world) || x === `ワールド${d.to_world}`; } },
        hints: ["usr_characters で <code>name</code> を検索してみましょう。world_id はどこ？", 'world_id は <code>mst_worlds</code> テーブルと対応しています。', 'log_character でこのキャラの action を確認しましょう。detail に移動元と移動先が入っています。'],
        reply: `お問い合わせありがとうございます。調査の結果、『${r.chara}』は${when(r.ts)}にワールド移動チケットを使用して、${from}から${to}へ移動しております。キャラクターは削除されておりませんので、${to}にログインしてご確認ください。`,
        reaction: 'イベントにつられて移動したの、完全に忘れてました……。',
        explain: `log_character の WORLD_TRANSFER（${when(r.ts)}、log_id ${r.log_id}）の detail は <code>${esc(r.detail)}</code>。usr_characters の world_id も ${r.now_w}（${esc(worldName[r.now_w])}）です。直前に log_item でワールド移動チケット（1201）を使っています。`,
        model: `SELECT c.*, w.name AS world_name
FROM usr_characters c JOIN mst_worlds w USING (world_id)
WHERE c.name = '${r.chara}';

SELECT log_id, action, detail, created_at
FROM log_character
WHERE user_id = ${sub(r.pub)}
ORDER BY created_at;`,
        honest: `消えていません。${to}にいます。あなたが連れて行きました。`,
      });
    });

    const RANK_OPTS = ['報酬は受け取り済み', 'プレゼントBOXに届いている（まだ受け取っていない）', '順位が報酬の対象外', '不具合で届いていない'];
    T.rank = (n) => {
      const all = rows(`
        SELECT r.user_id, u.public_id pub, r.rank, r.score, p.present_id, p.title, p.received_at recv, p.created_at ts, p.present_type ptype, p.quantity qty, i.name item, c.log_id cur_id
        FROM usr_rankings r JOIN usr_users u ON u.user_id = r.user_id
        JOIN usr_presents p ON p.user_id = r.user_id AND p.source = 'EVENT'
        LEFT JOIN mst_items i ON i.item_id = p.reward_id
        LEFT JOIN log_currency c ON c.user_id = r.user_id AND c.reason = 'PRESENT' AND c.ref_id = 'present:' || p.present_id
        WHERE r.event_id = 'ev_raid_star' ORDER BY r.rank`);
      const half = Math.ceil(n / 2);
      return [...pick(all.filter((r) => !r.recv), half), ...pick(all.filter((r) => r.recv && r.recv <= '2026-11-12 20:00:00'), n - half)].map((r) => {
        const got = !!r.recv;
        const reward = r.ptype === 'GEM' ? `ジェム${num(r.qty)}個` : `${r.item}×${r.qty}`;
        return mk({
          kind: 'rank', tier: 3, label: 'ランキング報酬', category: 'イベント', pub: r.pub, world: mainWorld(r.user_id), temper: 3,
          received: receivedAfter(got ? r.recv : r.ts, r.present_id),
          body: '星喰いの竜 討伐戦の順位報酬が、まだ届いていません。上位に入っていたはずなんですが……。',
          note: '順位報酬は、イベント終了後にプレゼントBOXへ配布しています。',
          correct: RANK_OPTS[got ? 0 : 1], wrongs: others(RANK_OPTS, RANK_OPTS[got ? 0 : 1]),
          evidence: { label: 'このユーザーの最終順位（rank）', placeholder: '例: 12', value: String(r.rank), accept: numAccept(r.rank) },
          hints: ["イベントIDは mst_events にあります。usr_rankings で <code>event_id = 'ev_raid_star'</code> の順位を見ましょう。", 'usr_presents に、順位報酬（source = EVENT）が届いているか確認しましょう。', 'received_at が入っていれば受け取り済み、NULL なら未受け取りです。'],
          reply: got ? `お問い合わせありがとうございます。調査の結果、お客様の最終順位は${r.rank}位で、順位報酬（${reward}）は${when(r.recv)}にお受け取りいただいていることを確認いたしました。`
            : `お問い合わせありがとうございます。調査の結果、お客様の最終順位は${r.rank}位で、順位報酬（${reward}）は${when(r.ts)}にプレゼントBOXへお届けしております。プレゼントBOXからお受け取りください。`,
          reaction: got ? 'もらってました。使ったのを忘れてました。' : 'BOXにありました！ありがとうございます！',
          explain: `usr_rankings（ev_raid_star）で ${r.rank} 位（与ダメージ ${num(r.score)}）。usr_presents に「${esc(r.title)}」（${esc(reward)}、present_id ${r.present_id}）が ${when(r.ts)} に届いていて、${got ? `${when(r.recv)} に受け取り済みです${r.cur_id ? `（log_currency の PRESENT、log_id ${r.cur_id}）` : ''}。` : 'received_at は NULL（未受け取り）です。'}`,
          model: `SELECT * FROM usr_rankings
WHERE event_id = 'ev_raid_star' AND user_id = ${sub(r.pub)};

SELECT * FROM usr_presents
WHERE user_id = ${sub(r.pub)} AND source = 'EVENT';`,
          honest: got ? 'もう受け取っています。' : 'プレゼントBOXを開いてください。',
        });
      });
    };

    // ======================================================================== 組み立て（合計 target 件）
    // 候補の少ない種類から先に選ぶ（同じユーザーは1回しか使わないため）
    const PLAN = [['restore', 3], ['world', 3], ['rename', 5], ['del', 5], ['rank', 4], ['expire', 5], ['maint', 7], ['payCancel', 5],
      ['loginFail', 6], ['gold', 8], ['ceiling', 5], ['noSsr', 5], ['mission', 10], ['loginBonus', 5], ['payOk', 6], ['sell', 6], ['trade', 5]];
    const out = [];
    for (const [k, n] of PLAN) out.push(...T[k](n));
    // 足りなければ、候補の多い種類で埋める
    const FILL = ['trade', 'gold', 'sell', 'payOk', 'loginBonus', 'loginFail', 'noSsr'];
    for (let f = 0; out.length < 93 && f < FILL.length * 3; f++) out.push(...T[FILL[f % FILL.length]](Math.min(2, 93 - out.length)));
    return out.slice(0, 93);
  }

  // ========================================================================== 研修（DAY 1 の前のチュートリアル）
  // 本番の100件と重ならないユーザーから、手順を教えやすい3件を毎回同じように選ぶ。
  // facts には、研修の各ステップの達成判定に使う値（user_id など）を入れておく。
  function training(DB, excludePubs) {
    const rows = (sql) => { const r = DB.exec(sql); if (!r.length) return []; const cols = r[0].columns; return r[0].values.map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]]))); };
    const pubs = [...new Set([...EXCLUDE, ...(excludePubs || [])])];
    const used = new Set(rows(`SELECT user_id FROM usr_users WHERE public_id IN (${pubs.map((p) => `'${p}'`).join(',')})`).map((r) => r.user_id));
    const first = (list) => { const r = list.find((x) => !used.has(x.user_id)); if (r) used.add(r.user_id); return r; };
    const fixed = (o) => ({ generated: true, training: true, tier: 0, temper: 2, spec: false, ...o });
    const out = [];

    // 研修1：キャラが消えた？ → usr_users で user_id を引き、usr_characters を見るだけ（消えていない）
    const a = first(rows(`
      SELECT u.user_id, u.public_id pub, c.character_id, c.name chara, c.level, c.job, w.name world
      FROM usr_users u JOIN usr_characters c USING (user_id) JOIN mst_worlds w USING (world_id)
      WHERE c.deleted_at IS NULL AND c.level >= 20
        AND (SELECT COUNT(*) FROM usr_characters x WHERE x.user_id = u.user_id) = 1
        AND (SELECT COUNT(*) FROM usr_characters x WHERE x.name = c.name) = 1
        AND NOT EXISTS (SELECT 1 FROM log_character x WHERE x.user_id = u.user_id AND x.action <> 'CREATE')
      ORDER BY u.user_id`));
    if (a) {
      out.push(fixed({
        id: 't1', no: 'TR-0001', label: 'キャラが消えた？', received: '2026-11-13 09:05', user: a.pub, world: a.world, category: 'キャラクター',
        body: `アプリを入れ直したら、キャラクター選択画面に『${a.chara}』がいません！レベル${a.level}まで育てたのに……消えてしまったんですか？`,
        note: '研修用のチケットです。まずは、キャラクターが本当に消えているかを確かめましょう。',
        options: [['a', 'キャラクターは消えていない（今もアカウントに残っている）'], ['b', '本人の操作による削除'], ['c', '第三者の不正ログインによる削除'], ['d', '不具合によるデータ消失']],
        answer: 'a',
        evidence: { label: `『${a.chara}』の character_id`, placeholder: '例: 123', table: null, value: String(a.character_id), accept: numAccept(a.character_id) },
        hints: ['usr_users を公開ID（public_id）で検索すると、内部の <code>user_id</code> が分かります。', `usr_characters を <code>WHERE user_id = ${a.user_id}</code> で絞り込みましょう。`, '<code>deleted_at</code> が NULL なら、削除されていません。'],
        reply: `お問い合わせありがとうございます。調査の結果、『${a.chara}』（レベル${a.level}）はお客様のアカウントに残っており、削除などの操作も行われていないことを確認いたしました。アプリの再インストール後は、引き継ぎ済みのアカウントでログインされているかご確認ください。`,
        reaction: 'ゲストでログインしてました！引き継ぎしたら出てきました！',
        explain: `usr_users で ${esc(a.pub)} を引くと user_id は ${a.user_id}。usr_characters を user_id で絞ると『${esc(a.chara)}』（character_id ${a.character_id}）が見つかり、<code>deleted_at</code> は NULL（未削除）です。log_character にも作成以外の操作はありません。消えていないので、ログインしているアカウントが違う可能性が高いです。`,
        model: `SELECT * FROM usr_users WHERE public_id = '${a.pub}';

SELECT * FROM usr_characters WHERE user_id = ${a.user_id};`,
        honest: '消えていません。たぶん、ログインしているアカウントが違います。',
        facts: { user_id: a.user_id, character_id: a.character_id },
      }));
    }

    // 研修2：ポーションが減った → ログを時系列に並べ、マスターと JOIN する（本人が使った）
    const b = first(rows(`
      SELECT l.log_id, l.user_id, u.public_id pub, l.quantity, l.created_at ts, m.name item, m.item_id
      FROM log_item l JOIN usr_users u USING (user_id) JOIN mst_items m USING (item_id)
      WHERE l.item_id = 1001 AND l.action = 'USE' AND l.quantity >= 3 AND l.created_at BETWEEN '2026-11-10 00:00:00' AND '2026-11-12 22:00:00'
        AND NOT EXISTS (SELECT 1 FROM log_item x WHERE x.user_id = l.user_id AND x.item_id = l.item_id AND x.created_at > l.created_at)
        AND NOT EXISTS (SELECT 1 FROM log_item x WHERE x.user_id = l.user_id AND x.item_id = l.item_id AND x.action IN ('TRADE_OUT', 'EXPIRE'))
      ORDER BY l.log_id`));
    if (b) {
      const w = rows(`SELECT w.name FROM usr_characters c JOIN mst_worlds w USING (world_id) WHERE c.user_id = ${b.user_id} AND c.deleted_at IS NULL ORDER BY c.level DESC LIMIT 1`);
      out.push(fixed({
        id: 't2', no: 'TR-0002', label: 'ポーションが減った', received: receivedAfter(b.ts, 3), user: b.pub, world: w.length ? w[0].name : '（未記入）', category: 'アイテム',
        body: `ポーションが${b.quantity}個、勝手に減っています！前に確認したときは、まだあったはずです。`,
        note: '研修用のチケットです。アイテムの増減は log_item に記録されています。',
        options: [['a', '他のプレイヤーへのトレード'], ['b', '期限切れによる消滅'], ['c', '本人が使用した（使用の記録がある）'], ['d', '不具合による消失']],
        answer: 'c',
        evidence: { label: '決め手になったログの log_id（log_item）', placeholder: '例: 1234', table: 'log_item', id: b.log_id, accept: numAccept(b.log_id) },
        hints: ['まずは usr_users で <code>user_id</code> を調べましょう。', `log_item を <code>WHERE user_id = ${b.user_id}</code> で絞り、<code>ORDER BY created_at DESC</code> で新しい順に並べましょう。`, "item_id だけでは何のアイテムか分かりません。<code>JOIN mst_items USING (item_id)</code> で名前を付けて、ポーションの <code>USE</code> を探しましょう。"],
        reply: `お問い合わせありがとうございます。調査の結果、${when(b.ts)}に、お客様のキャラクターがポーションを${b.quantity}個使用された記録を確認いたしました。トレードや不具合による消失ではございません。`,
        reaction: 'ボス戦で連打してました……。',
        explain: `log_item を user_id ${b.user_id} で絞って新しい順に並べ、mst_items と JOIN すると、item_id ${b.item_id} はポーション。ポーションの最後の記録は ${when(b.ts)} の <code>USE</code>（${b.quantity}個、log_id ${b.log_id}）で、本人が使っています。トレード（TRADE_OUT）や期限切れ（EXPIRE）の記録はありません。`,
        model: `SELECT * FROM usr_users WHERE public_id = '${b.pub}';

SELECT l.log_id, m.name, l.action, l.quantity, l.created_at
FROM log_item l
JOIN mst_items m USING (item_id)
WHERE l.user_id = ${b.user_id}
ORDER BY l.created_at DESC;`,
        honest: `ご自分で飲んでいます。${b.quantity}個まとめて。`,
        facts: { user_id: b.user_id, log_id: b.log_id },
      }));
    }

    // 研修3：ログインできなかった → 日付と AND で絞り込む（その日も普通にログインしている）
    const c = first(rows(`
      SELECT l.user_id, u.public_id pub, COUNT(*) n, MIN(l.log_id) log_id, MIN(l.created_at) ts
      FROM log_login l JOIN usr_users u USING (user_id)
      WHERE date(l.created_at) = '2026-11-11'
      GROUP BY l.user_id
      HAVING n >= 2 AND SUM(l.result = 'SUCCESS') = n
      ORDER BY l.user_id`));
    if (c) {
      const ok = rows(`SELECT log_id, created_at FROM log_login WHERE user_id = ${c.user_id} AND date(created_at) = '2026-11-11' AND result = 'SUCCESS' ORDER BY created_at`);
      const w = rows(`SELECT w.name FROM usr_characters x JOIN mst_worlds w USING (world_id) WHERE x.user_id = ${c.user_id} AND x.deleted_at IS NULL ORDER BY x.level DESC LIMIT 1`);
      out.push(fixed({
        id: 't3', no: 'TR-0003', label: 'ログインできない', received: '2026-11-12 10:20', user: c.pub, world: w.length ? w[0].name : '（未記入）', category: 'アカウント',
        body: '11月11日は一日中ログインできませんでした！サーバーが落ちていたんですよね？ログインボーナスを取り逃したので補填してください。',
        note: '研修用のチケットです。11月11日にサーバー障害は起きていません。',
        options: [['a', 'サーバー障害でログインできなかった'], ['b', 'その日もログインできている（成功の記録がある）'], ['c', 'パスワードの入力ミスが続いてロックされた'], ['d', '第三者にパスワードを変えられた']],
        answer: 'b',
        evidence: { label: '11月11日のログインの log_id（log_login）', placeholder: '例: 1234', table: 'log_login', id: ok[0].log_id, accept: numAccept(...ok.map((r) => r.log_id)) },
        hints: ['usr_users で <code>user_id</code> を調べましょう。', "log_login を user_id で絞り、さらに <code>AND date(created_at) = '2026-11-11'</code> で日付を絞りましょう。", '<code>result</code> が SUCCESS なら、ログインに成功しています。'],
        reply: `お問い合わせありがとうございます。調査の結果、11月11日は${ok.map((r) => r.created_at.slice(11, 16)).join('、')}に、お客様のアカウントへのログインに成功した記録を確認いたしました。また、同日にサーバー障害は発生しておりません。そのため、補填の対象外となります。`,
        reaction: '別の日と勘違いしてました……。',
        explain: `log_login を user_id ${c.user_id} と <code>date(created_at) = '2026-11-11'</code> の AND で絞ると、${ok.length}件ともすべて <code>SUCCESS</code>（最初は ${when(ok[0].created_at)}、log_id ${ok[0].log_id}）。失敗の記録はありません。ユーザーの言い分とログが食い違ったら、ログを信じます。`,
        model: `SELECT * FROM usr_users WHERE public_id = '${c.pub}';

SELECT log_id, result, ip_address, device_id, created_at
FROM log_login
WHERE user_id = ${c.user_id}
  AND date(created_at) = '2026-11-11'
ORDER BY created_at;`,
        honest: `普通にログインしています。${ok.length}回も。`,
        facts: { user_id: c.user_id, log_ids: ok.map((r) => r.log_id) },
      }));
    }
    return out;
  }

  root.CaseGen = { build, training };
  if (typeof module !== 'undefined' && module.exports) module.exports = { build, training };
})(typeof window !== 'undefined' ? window : globalThis);

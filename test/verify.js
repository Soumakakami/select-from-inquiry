const initSqlJs = require('sql.js');
const { buildDatabase } = require('../src/datagen.js');
(async () => {
  const SQL = await initSqlJs();
  const t0 = Date.now();
  const { db, keys, counts } = buildDatabase(SQL);
  console.log('build ms', Date.now() - t0, counts, keys);
  const q = (s) => { const r = db.exec(s); if (!r.length) { console.log('  (0 rows)'); return; } console.log('  ' + r[0].columns.join(' | ')); r[0].values.forEach(v => console.log('  ' + v.join(' | '))); };
  const U = (p) => `(SELECT user_id FROM usr_users WHERE public_id='${p}')`;
  console.log('\n== C1'); q(`SELECT * FROM usr_characters WHERE user_id=${U('U-38127')}`);
  q(`SELECT * FROM log_character WHERE user_id=${U('U-38127')} AND action='DELETE'`);
  q(`SELECT ip_address, device_id, result, COUNT(*) FROM log_login WHERE user_id=${U('U-38127')} GROUP BY 1,2,3`);
  q(`SELECT c.*, u.public_id FROM usr_characters c JOIN usr_users u USING(user_id) WHERE name='シルフィ'`);
  console.log('\n== C2'); q(`SELECT * FROM log_equip WHERE user_id=${U('U-52904')} AND equip_id=5012 ORDER BY created_at`);
  q(`SELECT user_id, equip_uid, action, created_at FROM log_equip WHERE equip_id=5012 AND user_id<>${U('U-52904')}`);
  q(`SELECT * FROM usr_equips WHERE equip_uid='EQ-7781-3302'`);
  console.log('\n== C3'); q(`SELECT * FROM log_currency WHERE user_id=${U('U-27730')} AND currency='GOLD' AND created_at BETWEEN '2026-11-07 21:00:00' AND '2026-11-09 08:59:59'`);
  q(`SELECT * FROM log_login WHERE user_id=${U('U-27730')} AND created_at BETWEEN '2026-11-07 21:00:00' AND '2026-11-09 08:59:59'`);
  console.log('\n== C4'); q(`SELECT * FROM usr_characters WHERE name='漆黒の堕天使'`); q(`SELECT * FROM log_character WHERE user_id=${U('U-44590')}`);
  console.log('\n== C5'); q(`SELECT * FROM log_payment WHERE user_id=${U('U-73315')}`); q(`SELECT * FROM log_currency WHERE user_id=${U('U-73315')} AND currency='GEM'`);
  q(`SELECT * FROM log_error WHERE user_id=${U('U-73315')}`);
  console.log('\n== C6'); q(`SELECT * FROM log_login WHERE user_id=${U('U-61458')} AND created_at >= '2026-11-07 09:00:00'`);
  q(`SELECT e.*, u.public_id FROM log_equip e JOIN usr_users u ON u.user_id=e.target_user_id WHERE e.user_id=${U('U-61458')} AND action='TRADE_OUT'`);
  q(`SELECT i.*, u.public_id FROM log_item i JOIN usr_users u ON u.user_id=i.target_user_id WHERE i.user_id=${U('U-61458')} AND action='TRADE_OUT'`);
  q(`SELECT * FROM usr_users WHERE public_id='U-90417'`);
  console.log('\n== C7'); q(`SELECT * FROM usr_users WHERE public_id IN ('U-15562','U-31846')`);
  q(`SELECT c.*, u.public_id FROM usr_characters c JOIN usr_users u USING(user_id) WHERE name IN ('ミルク','みるく')`);
  q(`SELECT DISTINCT l.user_id, u.public_id FROM log_login l JOIN usr_users u USING(user_id) WHERE ip_address IN (SELECT ip_address FROM log_login WHERE user_id=${U('U-15562')})`);
  q(`SELECT * FROM log_login WHERE user_id=${U('U-31846')} ORDER BY created_at DESC LIMIT 3`);
  console.log('\n== sanity');
  q(`SELECT COUNT(*) FROM log_currency WHERE balance_after < 0`);
  q(`SELECT name, world_id, COUNT(*) FROM usr_characters WHERE deleted_at IS NULL GROUP BY 1,2 HAVING COUNT(*)>1`);
  q(`SELECT MIN(created_at), MAX(created_at) FROM log_item WHERE created_at >= '2026-10-01'`);
  q(`SELECT ip_address, COUNT(DISTINCT user_id) n FROM log_login GROUP BY 1 HAVING n>1`);
  q(`SELECT sqlite_version()`);
  q(`SELECT action, COUNT(*) FROM log_item GROUP BY 1`);
  q(`SELECT action, COUNT(*) FROM log_equip GROUP BY 1`);
  console.log('\n== new tables');
  q(`SELECT COUNT(*) FROM log_item WHERE item_id IN (SELECT equip_id FROM mst_equips)`); // 0：装備は log_equip だけ
  q(`SELECT COUNT(*) FROM log_gacha g LEFT JOIN log_currency c ON c.log_id = g.currency_log_id WHERE c.reason IS NOT 'GACHA'`); // 0
  q(`SELECT gacha_id, SUM(rate) FROM mst_gacha_lineups GROUP BY 1`); // すべて 1000
  q(`SELECT COUNT(*) FROM log_currency c WHERE reason = 'QUEST_REWARD' AND ref_id NOT LIKE 'stage:%'`); // 0
  q(`SELECT event_id, COUNT(*), MAX(score) FROM usr_rankings GROUP BY 1`);
  // usr_gachas・usr_gacha_ceilings は log_gacha と食い違わない（0）
  q(`SELECT COUNT(*) FROM usr_gachas ug WHERE draw_count <> (SELECT COUNT(*) FROM log_gacha g WHERE g.user_id = ug.user_id AND g.gacha_id = ug.gacha_id)`);
  q(`SELECT COUNT(*) FROM usr_gacha_ceilings c JOIN usr_gachas g USING (user_id, gacha_id) WHERE c.ceiling_count + c.exchanged_count * (SELECT MAX(required_count) FROM mst_gacha_ceilings m WHERE m.gacha_id = c.gacha_id) <> g.draw_count`);
  q(`SELECT g.gacha_id, COUNT(*) users, SUM(draw_count) draws, MAX(draw_count) max_draws, (SELECT MAX(required_count) FROM mst_gacha_ceilings m WHERE m.gacha_id = g.gacha_id) ceiling FROM usr_gachas g GROUP BY 1`);
  // ミッション：受け取った報酬は必ずログに出ている（0）、達成していないのに受け取っていない（0）
  q(`SELECT COUNT(*) FROM usr_missions um JOIN mst_missions m USING (mission_id) WHERE um.received_at IS NOT NULL AND m.reward_type = 'GEM' AND NOT EXISTS (SELECT 1 FROM log_currency c WHERE c.user_id = um.user_id AND c.reason = 'MISSION' AND c.ref_id = 'mission:' || um.mission_id)`);
  q(`SELECT COUNT(*) FROM usr_missions WHERE received_at IS NOT NULL AND cleared_at IS NULL`);
  q(`SELECT m.mission_type, COUNT(*) rows_, SUM(cleared_at IS NOT NULL) cleared FROM usr_missions u JOIN mst_missions m USING (mission_id) GROUP BY 1`);
  q(`SELECT source, COUNT(*), SUM(received_at IS NULL) FROM usr_presents GROUP BY 1`);
  q(`SELECT COUNT(*) FROM usr_presents p WHERE present_type = 'GEM' AND received_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM log_currency c WHERE c.ref_id = 'present:' || p.present_id)`); // 0`);
})();

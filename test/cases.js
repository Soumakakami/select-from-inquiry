// 自動生成した問い合わせ票（src/casegen.js）と研修の3件が、すべて解ける状態かを確かめる
//   node test/cases.js
const initSqlJs = require('sql.js');
const { buildDatabase } = require('../src/datagen.js');
const { build, training } = require('../src/casegen.js');

(async () => {
  const SQL = await initSqlJs();
  const { db } = buildDatabase(SQL);
  const generated = build(db);
  const lessons = training(db, generated.map((c) => c.user));
  const cases = [...generated, ...lessons];
  const problems = [];
  if (lessons.length !== 3) problems.push(`training: expected 3 cases, got ${lessons.length}`);
  const users = new Set(), nos = new Set();
  const byKind = {}, byTier = {}, byAnswer = {};
  for (const c of cases) {
    if (!c.kind) c.kind = 'training';
    byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    byTier[c.tier] = (byTier[c.tier] || 0) + 1;
    byAnswer[c.answer] = (byAnswer[c.answer] || 0) + 1;
    if (users.has(c.user)) problems.push(`${c.id} ${c.kind}: user ${c.user} is used twice`);
    users.add(c.user);
    if (nos.has(c.no)) problems.push(`${c.id}: ticket no ${c.no} is used twice`);
    nos.add(c.no);
    if (!c.options.some(([v]) => v === c.answer)) problems.push(`${c.id}: answer ${c.answer} is not an option`);
    if (c.options.length !== 4) problems.push(`${c.id}: has ${c.options.length} options`);
    const expected = c.evidence.id != null ? String(c.evidence.id) : c.evidence.value;
    if (expected == null || !c.evidence.accept(expected)) problems.push(`${c.id} ${c.kind}: evidence does not accept its own value (${expected})`);
    if (c.evidence.accept('999999999')) problems.push(`${c.id} ${c.kind}: evidence accepts anything`);
    if (!(c.received >= '2026-10-20' && c.received <= '2026-11-13 09:45')) problems.push(`${c.id}: received ${c.received} is out of range`);
    // 模範SQLは全部動き、どれかは行を返す
    const stmts = c.model.split(/;\s*\n/).map((s) => s.replace(/;\s*$/, '').trim()).filter((s) => s.replace(/--[^\n]*/g, '').trim());
    let anyRows = false;
    for (const s of stmts) {
      try { const r = db.exec(s); if (r.length && r[0].values.length) anyRows = true; } catch (e) { problems.push(`${c.id} ${c.kind}: model SQL error: ${e.message}`); }
    }
    if (!anyRows) problems.push(`${c.id} ${c.kind}: model SQL returns no rows`);
    // 決め手のログIDが、そのユーザーの行を指している
    if (c.evidence.table && c.evidence.id != null) {
      const key = c.evidence.table === 'usr_presents' ? 'present_id' : 'log_id';
      const r = db.exec(`SELECT u.public_id FROM ${c.evidence.table} t JOIN usr_users u USING (user_id) WHERE t.${key} = ${c.evidence.id}`);
      const owner = r.length ? r[0].values[0][0] : null;
      if (c.kind !== 'trade' && owner !== c.user) problems.push(`${c.id} ${c.kind}: evidence row belongs to ${owner}, not ${c.user}`);
    }
  }
  console.log('cases:', generated.length, '+ training', lessons.length, 'kinds:', byKind);
  console.log('tiers:', byTier, 'answer letters:', byAnswer);
  console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'all generated and training cases OK');
  process.exitCode = problems.length ? 1 : 0;
})();

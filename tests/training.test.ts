import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedSets, exerciseHistory, suggestion, sessionTotals, parseInput } from '../src/app/lib/training';
import { sessionDay, defaultTemplate, legacyTemplate } from '../src/app/lib/useTemplate';
import type { Sessione, SetEseguito } from '../src/app/lib/idb';
const make = (sets: SetEseguito[], date = '2026-10-20', exerciseId = 'chest_press'): Sessione => ({ schemaVersion: 2, userId: 'local-user', sessionId: date, date, templateId: 'old', dayId: '2', status: 'completed', entries: [{ exerciseId, performedSets: sets }], createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T11:00:00.000Z` });
const set = (weight: number, reps: number, completed = true): SetEseguito => ({ setIndex: 1, weight, reps, completed });
const chest = defaultTemplate.days[1].exercises[0];
test('proposals and unfinished sets never affect totals or suggestions', () => {
 const session = make([set(100, 8, false), set(60, 8)]);
 assert.equal(sessionTotals(session).volume, 480); assert.equal(sessionTotals(session).sets, 1);
 assert.equal(exerciseHistory([session], 'chest_press')[0].max, 60);
});
test('unchanged exercises carry loads across plans and days; variants start blank', () => {
 const old = make([set(60, 8), set(55, 8)]); old.dayId = '1';
 assert.equal(seedSets(chest, [old])[0].weight, 60);
 assert.equal(seedSets(defaultTemplate.days[0].exercises[0], [make([set(100, 8)], undefined, 'rematore_bilanciere')])[0].weightString, '');
 assert.equal(seedSets(chest, [old])[0].completed, false);
});
test('legacy completed sessions remain usable; active sessions do not seed loads', () => {
 const old = make([{ setIndex: 1, weight: 70, reps: 8 }]);
 assert.equal(seedSets(chest, [old])[0].weight, 70); old.status = 'in_progress';
 assert.equal(exerciseHistory([old], 'chest_press').length, 0);
});
test('suggestion needs all targets hit at the same loads in two sessions', () => {
 const sets = chest.sets.map((s, i) => ({ ...set(60, s.repsTarget), setIndex: i + 1 }));
 assert.match(suggestion(chest, [make(sets), make(sets, '2026-10-18')]).title, /\+2,5/);
 assert.doesNotMatch(suggestion(chest, [make(sets)]).title, /\+2,5/);
 assert.doesNotMatch(suggestion(chest, [make(sets), make(sets.map(s => ({ ...s, weight: 55 })), '2026-10-18')]).title, /\+2,5/);
});
test('history uses snapshots and the exact archived legacy template', () => {
 const old = { ...make([]), templateId: legacyTemplate.templateId };
 assert.equal(sessionDay(old).label, legacyTemplate.days[1].label);
 const snapshot = structuredClone(defaultTemplate.days[0]); old.daySnapshot = snapshot;
 assert.equal(sessionDay(old), snapshot);
});
test('new program has exact order, ramp and explicit assumptions for missing targets', () => {
 assert.deepEqual(defaultTemplate.days.map(d => d.exercises.length), [6, 7, 8]);
 assert.deepEqual(defaultTemplate.days[0].exercises[3].sets.map(s => s.repsTarget), [10, 8, 6, 4, 6, 8, 10]);
 assert.deepEqual(defaultTemplate.days[0].exercises[3].weightOffsets, [0, 2, 4, 6, 4, 2, 0]);
 assert.equal(defaultTemplate.days[0].exercises[4].sets.length, 3);
 assert.deepEqual(defaultTemplate.days[2].exercises[6].sets.map(s => s.repsTarget), [15, 15]);
 assert.deepEqual(defaultTemplate.days[2].exercises[7].sets.map(s => s.repsTarget), [15, 12]);
 assert.deepEqual(defaultTemplate.days[1].exercises[0].sets.map(s => s.repsTarget), legacyTemplate.days[1].exercises[0].sets.map(s => s.repsTarget));
});
test('numeric parsing supports decimal comma and explicit zero, rejecting invalid values', () => {
 assert.equal(parseInput('12,5'), 12.5); assert.equal(parseInput('0'), 0);
 for (const v of ['', '-2', 'NaN', '12kg']) assert.equal(parseInput(v), undefined);
});
test('higher rep targets do not blindly reuse a load recorded for fewer reps', () => {
 const exercise = { ...chest, sets: [{ setIndex: 1, repsTarget: 12 }] };
 assert.equal(seedSets(exercise, [make([set(100, 6)])])[0].weightString, '');
 assert.equal(seedSets(exercise, [make([set(70, 12), set(80, 8)])])[0].weight, 70);
});
test('editing the archived program cannot rewrite historical sessions without snapshots', () => {
 const edited = { ...legacyTemplate, days: legacyTemplate.days.map(d => ({ ...d, label: 'Changed' })) };
 const old = { ...make([]), templateId: legacyTemplate.templateId };
 assert.equal(sessionDay(old, [edited]).label, legacyTemplate.days[1].label);
});
test('a missed rep target still proposes the prior load when the planned target is unchanged', () => {
 const old = make([set(60, 7)]); old.daySnapshot = structuredClone(defaultTemplate.days[1]);
 assert.equal(seedSets(chest, [old])[0].weight, 60);
});

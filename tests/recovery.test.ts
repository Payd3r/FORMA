import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRecovery, estimateRest, parseRestNote, muscleContributions, type TimedSet } from '../src/app/lib/recovery';
import type { Sessione } from '../src/app/lib/idb';
import type { ExerciseTemplate } from '../src/app/lib/useTemplate';
const now = Date.parse('2026-10-28T14:00:00.000Z');
const chest: ExerciseTemplate = { exerciseId: 'chest_press', name: 'Chest press', muscleGroup: 'Chest', sets: [1, 2, 3].map(setIndex => ({ setIndex, repsTarget: 8 })) };
function session(sets: TimedSet[], id = 's1', status: Sessione['status'] = 'completed'): Sessione { return { schemaVersion: 2, userId: 'local-user', sessionId: id, date: '2026-10-28', templateId: 'custom', dayId: '1', status, entries: [{ exerciseId: chest.exerciseId, performedSets: sets }], daySnapshot: { dayId: '1', label: 'Chest', exercises: [chest] }, createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T12:00:00.000Z' }; }
const set = (index: number, extra: Partial<TimedSet> = {}): TimedSet => ({ setIndex: index, weight: 60, reps: 8, completed: true, completedAt: '2026-10-28T12:00:00.000Z', ...extra });
test('explicit plan notes parse seconds, minutes and bounded ranges', () => {
 assert.equal(parseRestNote('90s - eccentrica lenta'), 90); assert.equal(parseRestNote('2-3m - mantenimento'), 180); assert.equal(parseRestNote('1,5 min'), 90); assert.equal(parseRestNote('riposa'), undefined); assert.equal(parseRestNote('1000m'), undefined);
 const result = estimateRest({ ...chest, sets: [{ setIndex: 1, repsTarget: 8, restNote: '2m' }] }, [], { now }); assert.equal(result.source, 'plan'); assert.equal(result.seconds, 120);
});
test('learns only explicitly measured successful rest; never set-to-set wall clock', () => {
 const samples = [100, 110, 120].map((restSeconds, i) => session([set(1, { restSeconds }), set(2, { completedAt: '2026-10-28T12:03:00.000Z' })], `s${i}`));
 const failure = session([set(1, { restSeconds: 550 }), set(2, { reps: 4, completedAt: '2026-10-28T12:12:00.000Z' })], 'failure');
 const result = estimateRest(chest, [...samples, failure], { now }); assert.equal(result.source, 'history'); assert.equal(result.seconds, 110); assert.equal(result.sampleCount, 3);
 assert.equal(estimateRest(chest, [session([set(1), set(2), set(3)])], { now }).source, 'default');
});
test('rest fallback adapts to exercise and missed targets without claiming learned data', () => {
 assert.equal(estimateRest(chest, [], { now }).seconds, 120);
 assert.equal(estimateRest({ ...chest, exerciseId: 'curl_ez' }, [], { now }).seconds, 90);
 assert.equal(estimateRest(chest, [], { now, set: set(1, { reps: 6 }) }).seconds, 135);
});
test('unconfirmed sets and future sessions do not create recent muscle load', () => {
 const proposed = session([set(1, { completed: false })]); const future = { ...session([set(1)], 'future'), date: '2026-10-30' }; future.entries[0].performedSets = [set(1, { completedAt: '2026-10-30T12:00:00.000Z' })];
 const report = calculateRecovery([proposed, future], [chest], now); assert.equal(report.observedSessions, 0); assert.ok(report.groups.every(g => g.status === 'unknown'));
});
test('direct and indirect load decay over time and untouched muscles remain unknown', () => {
 const sessions = [session([set(1), set(2), set(3)])]; const report = calculateRecovery(sessions, [chest], now); const group = report.groups.find(g => g.muscleGroup === 'Chest')!;
 assert.equal(group.status, 'recent'); assert.equal(group.hoursSinceLast, 2); assert.equal(group.weightedSets, 3);
 assert.ok(report.groups.find(g => g.muscleGroup === 'Triceps')!.recentLoad < group.recentLoad);
 assert.equal(report.groups.find(g => g.muscleGroup === 'Calves')!.status, 'unknown');
 const later = calculateRecovery(sessions, [chest], now + 72 * 3_600_000).groups.find(g => g.muscleGroup === 'Chest')!; assert.ok(later.recentLoad < group.recentLoad); assert.equal(later.status, 'lighter');
});
test('legacy data remains low confidence; repeated session ids are counted once', () => {
 const legacy = session([{ setIndex: 1, weight: 60, reps: 8 }]); const report = calculateRecovery([legacy, legacy], [chest], now);
 assert.equal(report.observedSessions, 1); assert.equal(report.groups.find(g => g.muscleGroup === 'Chest')!.confidence, 'low'); assert.equal(report.groups.find(g => g.muscleGroup === 'Chest')!.weightedSets, 1);
});
test('drop sets count as continuations and muscle mapping does not invent unrelated groups', () => {
 const report = calculateRecovery([session([set(1), set(2, { kind: 'drop' })])], [chest], now); assert.equal(report.groups.find(g => g.muscleGroup === 'Chest')!.weightedSets, 1.5);
 assert.equal(muscleContributions(chest).Triceps, .4); assert.equal(muscleContributions({ ...chest, exerciseId: 'croci_cavi' }).Triceps, undefined);
});

function restSamples(overrides: Partial<TimedSet> = {}, historicalExercise = chest) {
 return [1, 2, 3].map(i => {
  const result = session([set(1, { restSeconds: 100 }), set(2, { completedAt: '2026-10-28T12:03:00.000Z', ...overrides })], `sample${i}`);
  result.daySnapshot = { dayId: '1', label: 'Chest', exercises: [historicalExercise] }; return result;
 });
}
test('historical success uses the saved target rather than a changed current target', () => {
 const raisedTargets = { ...chest, sets: chest.sets.map(s => ({ ...s, repsTarget: 10 })) };
 const result = estimateRest(raisedTargets, restSamples(), { now });
 assert.equal(result.source, 'history'); assert.equal(result.sampleCount, 3);
 const formerlyHarder = restSamples({}, { ...chest, sets: chest.sets.map(s => ({ ...s, repsTarget: 10 })) });
 assert.equal(estimateRest(chest, formerlyHarder, { now }).sampleCount, 0);
});
test('unconfirmed or missing intermediate sets and duplicate indices invalidate rest pairs', () => {
 for (const sets of [
  [set(1, { restSeconds: 100 }), set(2, { completed: false }), set(3, { completedAt: '2026-10-28T12:05:00.000Z' })],
  [set(1, { restSeconds: 100 }), set(3, { completedAt: '2026-10-28T12:05:00.000Z' })],
  [set(1, { restSeconds: 100 }), set(2, { completedAt: '2026-10-28T12:05:00.000Z' }), set(2)]
 ]) assert.equal(estimateRest(chest, [session(sets)], { now }).sampleCount, 0);
});
test('future, invalid, reversed and implausibly short completion chronology cannot teach rest', () => {
 for (const completedAt of ['invalid', '2026-10-29T12:00:00.000Z', '2026-10-28T11:50:00.000Z', '2026-10-28T12:00:20.000Z']) {
  assert.equal(estimateRest(chest, restSamples({ completedAt }), { now }).sampleCount, 0);
 }
});
test('only comparable rep bands, load levels and recording modes teach rest', () => {
 assert.equal(estimateRest(chest, restSamples({ weight: 60 }), { now, set: set(1, { weight: 100 }) }).sampleCount, 0);
 assert.equal(estimateRest(chest, restSamples({ weight: 80 }), { now, set: set(1, { weight: 100 }) }).source, 'history');
 assert.equal(estimateRest({ ...chest, loadMode: 'each' }, restSamples(), { now }).sampleCount, 0);
 assert.equal(estimateRest({ ...chest, sets: chest.sets.map(s => ({ ...s, repsTarget: 15 })) }, restSamples(), { now }).sampleCount, 0);
 const sparse = estimateRest(chest, restSamples().slice(0, 2), { now });
 assert.equal(sparse.source, 'default'); assert.match(sparse.reasons.join(' '), /almeno 3/);
});

test('missing unknown historical snapshot does not substitute performed reps for planned target', () => {
 const unknown = restSamples().map(s => ({ ...s, daySnapshot: undefined }));
 assert.equal(estimateRest(chest, unknown, { now }).sampleCount, 0);
});

test('comparable archived rest instructions precede defaults but measured samples and current plan win', () => {
 const oldExercise = { ...chest, sets: chest.sets.map(s => ({ ...s, restNote: '3m' })) };
 const old = restSamples({}, oldExercise);
 // Fewer than three measured intervals: keep the real archived prescription.
 const prescribed = estimateRest(chest, old.slice(0, 2), { now });
 assert.equal(prescribed.source, 'plan'); assert.equal(prescribed.seconds, 180); assert.equal(prescribed.sampleCount, 0);
 assert.match(prescribed.reasons.join(' '), /scheda precedente/);
 assert.equal(estimateRest(chest, old, { now }).source, 'history');
 assert.equal(estimateRest(chest, old, { now }).seconds, 100);
 const currentPlan = { ...chest, sets: chest.sets.map(s => ({ ...s, restNote: '90s' })) };
 assert.equal(estimateRest(currentPlan, old, { now }).seconds, 90);
});
test('archived note must match exercise, recording mode and target band and use latest matching session', () => {
 const oldExercise = { ...chest, sets: chest.sets.map(s => ({ ...s, restNote: '3m' })) };
 const old = restSamples({}, oldExercise).slice(0, 1);
 assert.equal(estimateRest({ ...chest, exerciseId: 'panca_inclinata' }, old, { now }).source, 'default');
 assert.equal(estimateRest({ ...chest, loadMode: 'each' }, old, { now }).source, 'default');
 assert.equal(estimateRest({ ...chest, sets: chest.sets.map(s => ({ ...s, repsTarget: 15 })) }, old, { now }).source, 'default');
 const recent = structuredClone(old[0]); recent.sessionId = 'recent'; recent.createdAt = '2026-10-28T13:00:00.000Z';
 recent.daySnapshot!.exercises[0].sets.forEach(s => s.restNote = '90s');
 assert.equal(estimateRest(chest, [...old, recent], { now }).seconds, 90);
});

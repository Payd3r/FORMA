import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
test('single-user API preserves snapshots, rejects stale writes, propagates deletes and syncs plans', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'forma-api-'));
  const process = spawn('node', ['server/dist/index.js'], { env: { ...globalThis.process.env, DB_PATH: path.join(temp, 'fitness.db'), PORT: '3199' }, stdio: 'pipe' });
  const api = async (route: string, method = 'GET', body?: unknown) => fetch(`http://127.0.0.1:3199/api${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await api('/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 50)); }
    const session = { schemaVersion: 2, userId: 'legacy-user', sessionId: 'test-session', templateId: 'plan1', dayId: '1', date: '2026-10-28', status: 'completed', entries: [{ exerciseId: 'chest_press', performedSets: [{ setIndex: 1, weight: 60, reps: 8, completed: true }] }], createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T11:00:00.000Z', templateName: 'My plan', daySnapshot: { dayId: '1', label: 'Old chest day', exercises: [{ exerciseId: 'chest_press', name: 'Chest press', sets: [{ setIndex: 1, repsTarget: 8 }] }] } };
    assert.equal((await api('/sessions/test-session', 'PUT', session)).status, 200);
    let state = await (await api('/state')).json(); assert.equal(state.sessions[0].daySnapshot.label, 'Old chest day'); assert.equal(state.sessions[0].entries[0].performedSets[0].completed, true);
    const stale = { ...session, updatedAt: '2026-10-28T10:30:00.000Z', entries: [] };
    await api('/sessions/test-session', 'PUT', stale); state = await (await api('/state')).json(); assert.equal(state.sessions[0].entries.length, 1);
    assert.equal((await api('/sessions/test-session', 'DELETE', { updatedAt: '2026-10-28T12:00:00.000Z' })).status, 204);
    // Delete retry must be idempotent; old clients cannot resurrect the deleted session.
    assert.equal((await api('/sessions/test-session', 'DELETE', { updatedAt: '2026-10-28T12:00:00.000Z' })).status, 204);
    await api('/sessions/test-session', 'PUT', session); state = await (await api('/state')).json(); assert.equal(state.sessions.length, 0); assert.equal(state.deleted.length, 1);
    const newerSettingsTime = new Date(Date.now() + 10000).toISOString();
    const olderSettingsTime = new Date(Date.now() + 5000).toISOString();
    await api('/settings/templates', 'PUT', { value: { activeId: 'new' }, updatedAt: newerSettingsTime });
    await api('/settings/templates', 'PUT', { value: { activeId: 'old' }, updatedAt: olderSettingsTime });
    state = await (await api('/state')).json(); assert.equal(state.settings[0].value.activeId, 'new');
    const legacyEdit = { ...session, sessionId: 'unsent-legacy-edit', dayId: '2', templateId: '3x-week-hypertrophy', daySnapshot: undefined, templateName: undefined };
    await api('/sessions/unsent-legacy-edit', 'PUT', legacyEdit);
    state = await (await api('/state')).json();
    const preservedLegacy = state.sessions.find((s: { sessionId: string }) => s.sessionId === legacyEdit.sessionId);
    assert.equal(preservedLegacy.updatedAt, legacyEdit.updatedAt);
    assert.equal(preservedLegacy.daySnapshot.label, '2 - Petto/Spalle/Tricipiti');
    assert.equal(preservedLegacy.entries[0].performedSets[0].weight, 60);
    assert.equal((await api('/sessions/invalid', 'PUT', { ...session, entries: [{ exerciseId: 'bad', performedSets: [{ weight: -10, reps: 8 }] }] })).status, 400);
  } finally { process.kill(); await new Promise<void>(resolve => { if (process.exitCode !== null) resolve(); else process.once('exit', () => resolve()); }); await rm(temp, { recursive: true, force: true }); }
});

import { test, expect, type Page } from '@playwright/test';
async function isolate(page: Page) {
  const sessions = new Map<string, any>(); const settings = new Map<string, any>(); const deleted = new Map<string, any>();
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); const method = route.request().method();
    const body = method === 'GET' ? null : route.request().postDataJSON();
    if (url.pathname === '/api/state') return route.fulfill({ json: { sessions: [...sessions.values()], settings: [...settings.values()], deleted: [...deleted.values()] } });
    if (url.pathname.startsWith('/api/sessions/')) {
      const id = url.pathname.split('/').at(-1)!;
      if (method === 'DELETE') { sessions.delete(id); deleted.set(id, body); return route.fulfill({ status: 204 }); }
      sessions.set(id, body); return route.fulfill({ json: { applied: true } });
    }
    if (url.pathname.startsWith('/api/settings/')) { settings.set(body.key, body); return route.fulfill({ json: { saved: true } }); }
    return route.fulfill({ json: {} });
  }); return { sessions, settings, deleted };
}
test('new workout, decimal comma, explicit confirmation, durable reload and history', async ({ page }) => {
  await isolate(page); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/workout?day=1'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  const weight = page.getByRole('textbox', { name: 'Rematore al multipower serie 1 kg', exact: true });
  await weight.fill('42,5'); await page.getByRole('button', { name: 'Conferma Rematore al multipower serie 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annulla Rematore al multipower serie 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: 'Rematore al multipower serie 2 kg', exact: true }).fill('100');
  await page.reload(); await expect(weight).toHaveValue('42,5');
  await page.getByRole('button', { name: 'Concludi', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('1 serie confermate');
  await page.getByRole('button', { name: 'Salva e concludi' }).click(); await expect(page).toHaveURL(/history/);
  await expect(page.getByRole('link', { name: /Dorso & bicipiti/ })).toContainText('340');
  await page.getByRole('link', { name: /Dorso & bicipiti/ }).click(); await expect(weight).toHaveValue('42,5');
  expect(errors).toEqual([]);
});
test('ramp weights, drop set, substitute and undo without rewriting the program', async ({ page }) => {
  await isolate(page); await page.goto('/workout?day=1'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('button', { name: 'Vai a Curl su panca · presa classica', exact: true }).click();
  await page.getByRole('textbox', { name: 'Curl su panca · presa classica serie 1 kg', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Applica rampa +2 kg' }).click();
  for (const [i, value] of ['10', '12', '14', '16', '14', '12', '10'].entries()) await expect(page.getByRole('textbox', { name: `Curl su panca · presa classica serie ${i + 1} kg`, exact: true })).toHaveValue(value);
  await page.getByRole('button', { name: 'Vai a Rematore al multipower', exact: true }).click();
  await page.locator('#ex-rematore_multipower').getByRole('button', { name: 'Sostituisci' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Chest press/ }).click();
  await expect(page.locator('#ex-chest_press')).toBeVisible(); await page.getByRole('button', { name: 'Annulla modifica' }).click();
  await expect(page.locator('#ex-rematore_multipower')).toBeVisible();
});
test('plan editor duplicates, changes targets, activates and preserves active snapshot', async ({ page }) => {
  await isolate(page); await page.goto('/workout?day=2'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.goto('/plans'); await page.getByRole('button', { name: 'Duplica', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'NOME DELLA SCHEDA' }).fill('Scheda test');
  await page.getByRole('spinbutton', { name: 'Chest press target serie 1', exact: true }).fill('12');
  await page.getByRole('button', { name: 'Salva scheda', exact: true }).click();
  const card = page.locator('.plan-card').filter({ has: page.getByRole('heading', { name: 'Scheda test', exact: true }) });
  await card.getByRole('button', { name: 'Usa scheda' }).click(); await page.getByText('Riparti con carichi vuoti', { exact: true }).click(); await page.getByRole('button', { name: 'Attiva scheda' }).click();
  await expect(card).toContainText('IN USO'); await page.goto('/workout');
  await expect(page.getByRole('textbox', { name: 'Chest press serie 1 ripetizioni', exact: true })).toHaveValue('8');
});
test('mobile layout fits and all primary actions stay usable', async ({ page }) => {
  await isolate(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.screenshot({ path: 'artifacts/forma-mobile-home.png', fullPage: true });
  for (const route of ['/workout?day=3', '/plans', '/progress', '/history', '/settings']) {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/workout?day=3'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('button', { name: 'Vai a Push down tricipiti', exact: true }).click();
  await page.locator('#ex-pushdown_corda').getByRole('button', { name: '↘ Scalo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Push down tricipiti serie 4 kg', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/forma-mobile-workout.png', fullPage: true });
});
test('opens immediately with an unreachable backend; offline changes survive reload', async ({ page, context }) => {
  await page.route('**/api/**', route => new Promise(resolve => setTimeout(async () => { await route.abort().catch(() => {}); resolve(undefined); }, 12000)));
  await page.goto('/'); await expect(page.locator('h1')).toBeVisible({ timeout: 3000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.reload();
  await context.setOffline(true); await page.getByRole('navigation', { name: 'Navigazione principale' }).count();
  await page.goto('/workout?day=2'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true }).fill('60');
  await page.getByRole('button', { name: 'Conferma Chest press serie 1', exact: true }).click();
  await page.reload(); await expect(page.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true })).toHaveValue('60');
});
test('real PWA update prompts and preserves the active session through reload', async ({ page, request }) => {
  await isolate(page); await page.goto('/workout?day=2');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.reload();
  await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true }).fill('65');
  await page.getByRole('button', { name: 'Conferma Chest press serie 1', exact: true }).click();
  await request.get('/__test/update'); await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); });
  await expect(page.getByRole('dialog')).toContainText('Aggiornamento disponibile');
  await page.getByRole('button', { name: 'Aggiorna adesso' }).click();
  await expect(page.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true })).toHaveValue('65');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('desktop uses fixed light theme and FORMA branding without punctuation', async ({ page }) => {
  await isolate(page);
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/'); await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.locator('.brand')).toContainText('FORMA');
  expect(await page.locator('.brand').innerText()).not.toMatch(/FORMA\s*\./);
  await page.screenshot({ path: 'artifacts/forma-desktop-home.png', fullPage: true });
  await page.goto('/settings'); await expect(page.getByRole('button', { name: /Scuro/ })).toHaveCount(0);
  await page.reload(); await expect(page.locator('html')).not.toHaveClass(/dark/);
  for (const route of ['/plans', '/progress', '/history', '/settings']) {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
    expect((await page.locator('h1').innerText()).trim()).not.toMatch(/\.$/);
  }
});
test('legacy IndexedDB v2 migration preserves data and old program labels', async ({ page }) => {
  await isolate(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded-v2')) return;
    localStorage.setItem('seeded-v2', 'true');
    const request = indexedDB.open('fitness', 2);
    request.onupgradeneeded = () => {
      const db = request.result; const store = db.createObjectStore('sessioni', { keyPath: 'sessionId' });
      store.createIndex('by-status', 'status'); store.createIndex('by-template', 'templateId'); store.createIndex('by-date', 'date');
      store.put({ schemaVersion: 1, userId: 'old-user', sessionId: 'legacy1', templateId: '3x-week-hypertrophy', dayId: '2', date: '2026-10-20', status: 'completed', entries: [{ exerciseId: 'chest_press', performedSets: [{ setIndex: 1, weight: 60, reps: 8 }] }], createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T11:00:00.000Z' });
    }; request.onsuccess = () => request.result.close();
  });
  await page.goto('/history'); await expect(page.getByRole('link', { name: /Petto\/Spalle\/Tricipiti/ })).toBeVisible();
  await page.goto('/workout?day=2'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true })).toHaveValue('60');
  await page.goto('/history'); await page.getByRole('link', { name: /Petto\/Spalle\/Tricipiti/ }).click();
  await expect(page.getByRole('heading', { name: /Petto\/Spalle\/Tricipiti/ })).toBeVisible();
});
test('an in-flight sync cannot drop a newer local edit', async ({ page }) => {
  let release: () => void = () => {}; const hold = new Promise<void>(resolve => { release = resolve; }); let held = false; const sent: any[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() === 'PUT' && url.pathname.includes('/sessions/')) {
      const payload = request.postDataJSON(); sent.push(payload);
      if (payload.entries[0]?.performedSets[0]?.weight === 42 && !held) { held = true; await hold; }
      return route.fulfill({ json: { applied: true } });
    }
    return route.fulfill({ json: { sessions: [], settings: [], deleted: [] } });
  });
  await page.goto('/workout?day=2'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  const weight = page.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true }); await weight.fill('42');
  await expect.poll(() => held).toBe(true); await weight.fill('43'); release();
  await page.getByRole('button', { name: /Salvato qui|sincronizz|Salvataggio sul dispositivo/ }).first().click();
  await expect.poll(() => sent.some(s => s.entries[0]?.performedSets[0]?.weight === 43)).toBe(true);
  await page.reload(); await expect(weight).toHaveValue('43');
});
test('backup export and import add missing sessions without overwriting current data', async ({ page }) => {
  await isolate(page); await page.goto('/settings');
  const backup = { sessions: [{ schemaVersion: 2, userId: 'local-user', sessionId: 'imported', templateId: '3x-week-hypertrophy', dayId: '2', date: '2026-10-20', status: 'completed', entries: [{ exerciseId: 'chest_press', performedSets: [{ setIndex: 1, weight: 60, reps: 8, completed: true }] }], createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T11:00:00.000Z' }] };
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: 'Importa dati', exact: true }).click(); await expect(page.getByRole('status')).toContainText('1 sedute importate');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Esporta backup' }).click(); expect((await download).suggestedFilename()).toMatch(/^forma-backup/);
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: 'Importa dati', exact: true }).click(); await expect(page.getByRole('status')).toContainText('0 sedute importate');
});
test('real backend synchronizes completed sessions and deletions across two devices', async ({ browser }) => {
  const first = await browser.newContext(); const second = await browser.newContext();
  const a = await first.newPage(); const b = await second.newPage();
  try {
    await a.goto('/workout?day=2'); await a.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
    await a.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true }).fill('77');
    await a.getByRole('button', { name: 'Conferma Chest press serie 1', exact: true }).click();
    await a.getByRole('button', { name: 'Concludi', exact: true }).click(); await a.getByRole('button', { name: 'Salva e concludi' }).click();
    await expect(a.getByRole('button', { name: 'Tutto sincronizzato', exact: true })).toBeVisible();
    const link = a.getByRole('link', { name: /Petto & gambe.*616/ }).first(); await expect(link).toBeVisible(); const url = await link.getAttribute('href');
    await expect.poll(async () => { const state = await (await a.request.get('/api/state')).json(); return state.sessions.find((s: any) => `/workout/${s.sessionId}` === url)?.status; }).toBe('completed');
    await b.goto('/history'); await expect(b.locator(`a[href="${url}"]`)).toBeVisible();
    await a.goto(url!); await a.getByRole('button', { name: 'Elimina seduta', exact: true }).click(); await a.getByRole('dialog').getByRole('button', { name: 'Elimina seduta', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Tutto sincronizzato', exact: true })).toBeVisible();
    await expect.poll(async () => { const state = await (await a.request.get('/api/state')).json(); return state.deleted.some((s: any) => `/workout/${s.sessionId}` === url); }).toBe(true);
    await b.getByRole('button', { name: 'Tutto sincronizzato', exact: true }).click(); await expect(b.locator(`a[href="${url}"]`)).toHaveCount(0);
  } finally { await first.close(); await second.close(); }
});
test('legacy sync queue keeps its final delete rather than resurrecting an earlier upsert', async ({ page }) => {
  const remote = await isolate(page);
  const session = { schemaVersion: 1, userId: 'old-user', sessionId: 'legacy-deleted', templateId: '3x-week-hypertrophy', dayId: '2', date: '2026-10-20', status: 'completed', entries: [], createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T11:00:00.000Z' };
  remote.sessions.set(session.sessionId, session);
  await page.addInitScript(session => {
    localStorage.setItem('fitness-sync-queue', JSON.stringify([{ type: 'upsert', sessionId: session.sessionId, payload: session, timestamp: session.updatedAt }, { type: 'delete', sessionId: session.sessionId, timestamp: '2026-10-20T12:00:00.000Z' }]));
  }, session);
  await page.goto('/history');
  await expect.poll(() => remote.deleted.has(session.sessionId)).toBe(true);
  expect(remote.sessions.has(session.sessionId)).toBe(false);
  await expect(page.locator('.session-row')).toHaveCount(0);
});
test('plan preview, exercise library, compact copy and consistent filter heights', async ({ page }) => {
  await isolate(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plans'); await expect(page.getByRole('heading', { name: 'Schede' })).toBeVisible();
  await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Rematore al multipower');
  await expect(page.getByRole('dialog')).toContainText('10 / 8 / 6 / 4 / 6 / 8 / 10');
  await page.getByRole('button', { name: 'Chiudi', exact: true }).last().click();
  await page.getByRole('button', { name: 'Modifica', exact: true }).first().click();
  await page.getByRole('button', { name: 'Aggiungi esercizio', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Gruppo muscolare' }).selectOption('Chest');
  await expect(page.getByRole('dialog').getByRole('button', { name: /Panca piana bilanciere/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Panca piana bilanciere/ }).click();
  await expect(page.locator('.plan-exercise-editor').filter({ hasText: 'Panca piana bilanciere' })).toBeVisible();
  await page.goto('/history');
  const heights = await page.locator('.history-filters > .input').evaluateAll(items => items.map(item => item.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
  await page.goto('/progress'); await expect(page.getByRole('heading', { name: 'Carichi', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Allenamenti settimanali' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Serie per gruppo muscolare' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/forma-refined-progress-mobile.png', fullPage: true });
});
test('exercise stepper shows one exercise and never confirms sets when navigating', async ({ page }) => {
  await isolate(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workout?day=1'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await expect(page.locator('.exercise-panel')).toHaveCount(1);
  await expect(page.locator('#ex-rematore_multipower')).toBeVisible();
  await page.getByRole('textbox', { name: 'Rematore al multipower serie 1 kg', exact: true }).fill('40');
  await page.getByRole('button', { name: 'Esercizio successivo', exact: true }).click();
  await expect(page.locator('.exercise-panel')).toHaveCount(1);
  await expect(page.locator('#ex-iliac_pulldown')).toBeVisible();
  await page.getByRole('button', { name: 'Esercizio precedente', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Rematore al multipower serie 1 kg', exact: true })).toHaveValue('40');
  await expect(page.getByRole('button', { name: 'Conferma Rematore al multipower serie 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Vai a Pulley', exact: true }).click();
  await expect(page.locator('#ex-pulley_basso')).toBeVisible();
  await expect(page.locator('.exercise-panel')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/forma-exercise-stepper-mobile.png', fullPage: true });
});
test('reordered exercise sequence persists reload without changing any set values', async ({ page }) => {
  await isolate(page); await page.goto('/workout?day=1'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rematore al multipower serie 1 kg', exact: true }).fill('45');
  await page.getByRole('button', { name: 'Ordine esercizi', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sposta su Iliac pull down', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).last().click();
  const stepper = page.locator('button[aria-label^="Vai a "]');
  await expect(stepper.first()).toHaveAttribute('aria-label', 'Vai a Iliac pull down');
  await page.reload(); await expect(stepper.first()).toHaveAttribute('aria-label', 'Vai a Iliac pull down');
  await page.getByRole('button', { name: 'Vai a Rematore al multipower', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Rematore al multipower serie 1 kg', exact: true })).toHaveValue('45');
  await expect(page.getByRole('button', { name: 'Conferma Rematore al multipower serie 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
test('automatic rest starts after confirmation and survives a reload', async ({ page }) => {
  await isolate(page); await page.goto('/workout?day=2'); await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  const timer = page.getByRole('timer');
  await expect(timer).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Chest press serie 1 kg', exact: true }).fill('60');
  await page.getByRole('button', { name: 'Conferma Chest press serie 1', exact: true }).click();
  await expect(timer).toBeVisible(); await expect(timer).toContainText(/\d+:\d{2}/);
  const before = (await timer.innerText()).match(/(\d+):(\d{2})/)!;
  const secondsBefore = Number(before[1]) * 60 + Number(before[2]);
  await page.reload(); await expect(timer).toBeVisible();
  const after = (await timer.innerText()).match(/(\d+):(\d{2})/)!;
  const secondsAfter = Number(after[1]) * 60 + Number(after[2]);
  expect(secondsAfter).toBeLessThanOrEqual(secondsBefore);
  expect(secondsAfter).toBeGreaterThan(secondsBefore - 15);
  await page.getByRole('button', { name: 'Salta recupero', exact: true }).click();
  await expect(timer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Annulla Chest press serie 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

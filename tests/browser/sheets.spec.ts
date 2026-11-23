import { test, expect, type Page } from '@playwright/test';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
async function setup(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ json: { sessions: [], settings: [], deleted: [] } }));
  await page.goto('/plans');
}
async function swipe(page: Page, selector: string, distance: number) {
  await page.getByRole('dialog').locator(selector).first().evaluate((element, distance) => {
    const bounds = element.getBoundingClientRect(); const x = bounds.left + 20; const y = Math.max(bounds.top + 10, 120);
    const fire = (type: string, offset: number) => { const touch = new Touch({ identifier: 1, target: element, clientX: x, clientY: y + offset }); element.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch] })); };
    fire('touchstart', 0); fire('touchmove', distance / 2); fire('touchmove', distance); fire('touchend', distance);
  }, distance);
}
test('sheet pins footer and locks the background while its content scrolls', async ({ page }) => {
  await setup(page); await page.evaluate(() => window.scrollTo(0, 220)); const before = await page.evaluate(() => scrollY);
  const viewportBefore = await page.evaluate(() => ({ inner: innerHeight, client: document.documentElement.clientHeight, visual: visualViewport?.height }));
  await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  const sheet = page.getByRole('dialog'); await expect(sheet).toBeVisible();
  await sheet.locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  expect(await page.evaluate(() => ({ body: document.body.style.position, bodyTop: document.body.style.top, htmlOverflow: document.documentElement.style.overflow, bodyOverflow: document.body.style.overflow })))
    .toEqual({ body: 'fixed', bodyTop: `${-before}px`, htmlOverflow: 'hidden', bodyOverflow: 'hidden' });
  expect(await page.evaluate(() => ({ inner: innerHeight, client: document.documentElement.clientHeight, visual: visualViewport?.height }))).toEqual(viewportBefore);
  const lockedY = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo({ top: 734, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(lockedY);
  const footer = await page.getByRole('dialog').locator('.sheet-footer').boundingBox(); expect(footer!.y + footer!.height).toBeLessThanOrEqual(845);
  await page.getByRole('dialog').locator('.sheet-content').evaluate(element => element.scrollTop = 250);
  expect(await page.getByRole('dialog').locator('.sheet-content').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  const after = await page.getByRole('dialog').locator('.sheet-footer').boundingBox(); expect(after!.y).toBeCloseTo(footer!.y, 0);
  await swipe(page, '.sheet-content', 150); await expect(sheet).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).last().click();
  await expect(sheet).not.toBeVisible();
  expect(await page.evaluate(() => ({ body: document.body.style.position, htmlOverflow: document.documentElement.style.overflow, bodyOverflow: document.body.style.overflow })))
    .toEqual({ body: '', htmlOverflow: '', bodyOverflow: '' });
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0);
});
test('downward gesture from content at its top dismisses the sheet', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('dialog').locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await swipe(page, '.plan-view h3', 160); await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('exercise removal leaves the session editor open after cancel and confirm', async ({ page }) => {
  await setup(page);
  await page.goto('/workout?day=1');
  await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('button', { name: 'Gestisci ordine ed esercizi' }).click();
  const editor = page.getByRole('dialog', { name: 'Ordine ed esercizi' });
  const remove = editor.getByRole('button', { name: 'Rimuovi Rematore al multipower', exact: true });
  const confirmation = page.getByRole('dialog', { name: 'Rimuovere questo esercizio?' });
  const openSheets = page.locator('dialog.bottom-sheet[open]');

  await remove.click();
  await expect(openSheets).toHaveCount(2);
  await confirmation.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(remove).toBeVisible();

  await remove.click();
  await confirmation.getByRole('button', { name: 'Rimuovi esercizio', exact: true }).click();
  await expect(openSheets).toHaveCount(1);
  await expect(editor).toBeVisible();
  await expect(remove).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Aggiungi esercizio', exact: true })).toBeVisible();
});
test('plan editor saves names for two different days', async ({ page }) => {
  await setup(page);
  const card = page.locator('.plan-card').first();
  await card.getByRole('button', { name: 'Modifica', exact: true }).click();
  const dayName = page.getByRole('textbox', { name: 'Nome del giorno' });
  const tabs = page.locator('.plan-day-tab');

  await dayName.fill('Tirata');
  await tabs.nth(1).click();
  await dayName.fill('Spinta');
  await tabs.first().click();
  await expect(dayName).toHaveValue('Tirata');
  await page.getByRole('button', { name: 'Salva scheda', exact: true }).click();
  await expect(card).toContainText('Tirata');
  await expect(card).toContainText('Spinta');
});
test('sheet follows visual viewport when keyboard opens and keeps actions reachable', async ({ page }) => {
  await setup(page); await page.goto('/workout?day=1');
  await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('button', { name: 'Gestisci ordine ed esercizi' }).click();
  await page.getByRole('button', { name: 'Aggiungi esercizio', exact: true }).click();
  const sheet = page.locator('dialog.bottom-sheet[open]').last();
  await sheet.locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('DIALOG');
  await page.getByRole('textbox', { name: 'Cerca esercizio' }).click();
  await page.getByRole('textbox', { name: 'Cerca esercizio' }).fill('panca');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 430 });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 160 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(sheet).toHaveClass(/keyboard-open/);
  const dialog = await sheet.boundingBox(); expect(dialog!.y).toBeCloseTo(160, 0);
  expect(dialog!.y - 160).toBeCloseTo(0, 0);
  expect(dialog!.height).toBeCloseTo(430, 0);
  const footer = await sheet.locator('.sheet-footer').boundingBox(); expect(footer!.y + footer!.height - 160).toBeLessThanOrEqual(431);
  await expect(sheet.getByRole('button', { name: 'Annulla', exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 844 });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 0 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(sheet).not.toHaveClass(/keyboard-open/);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 430 });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 160 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(sheet).toHaveClass(/keyboard-open/);
  await sheet.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(page.locator('dialog.bottom-sheet[open]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  const parent = page.locator('dialog.bottom-sheet[open]').last();
  await parent.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(page.locator('dialog.bottom-sheet[open]')).toHaveCount(0);
  expect(await page.evaluate(() => ({ html: document.documentElement.style.overflow, body: document.body.style.overflow })))
    .toEqual({ html: '', body: '' });
});
test('sheet dimensions follow the visual viewport instead of the reduced client area', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  const sheet = page.getByRole('dialog'); await expect(sheet).toBeVisible();
  await sheet.locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await page.evaluate(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 852 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 793 });
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 852 });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 0 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => sheet.evaluate(element => element.style.getPropertyValue('--sheet-viewport-height'))).toBe('852px');
  const portal = await sheet.boundingBox();
  expect(portal!.y).toBeCloseTo(0, 0);
  expect(portal!.height).toBeCloseTo(852, 0);
  expect(portal!.y + portal!.height).toBeCloseTo(852, 0);
  await sheet.locator('.sheet-footer').evaluate(element => { (element as HTMLElement).style.paddingBottom = '34px'; });
  const footer = await sheet.locator('.sheet-footer').boundingBox();
  const action = await sheet.locator('.sheet-footer .btn').first().boundingBox();
  expect(footer!.y + footer!.height).toBeCloseTo(852, 0);
  expect(action!.y + action!.height).toBeLessThanOrEqual(818);
});

test('portal stays within visual viewport so footer remains visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 852 });
  await page.route('**/api/**', route => route.fulfill({ json: { sessions: [], settings: [], deleted: [] } }));
  await page.goto('/plans');
  const pageBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.evaluate(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 793 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 793 });
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 793 });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 0 });
  });
  await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  const sheet = page.locator('dialog.bottom-sheet[open]');
  await sheet.locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  const portal = await sheet.boundingBox();
  const panel = await sheet.locator('.sheet-panel').boundingBox();
  const footer = await sheet.locator('.sheet-footer').boundingBox();
  expect(portal!.y).toBeCloseTo(0, 0);
  expect(portal!.y + portal!.height).toBeCloseTo(793, 0);
  expect(panel!.y).toBeGreaterThanOrEqual(23);
  expect(footer!.y + footer!.height).toBeCloseTo(793, 0);
  await sheet.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  expect(await page.evaluate(() => ({ body: document.body.style.backgroundColor, html: document.documentElement.style.backgroundColor, computed: getComputedStyle(document.body).backgroundColor })))
    .toEqual({ body: '', html: '', computed: pageBackground });
});

test('keyboard viewport offset is compensated and stale pageTop does not keep keyboard state', async ({ page }) => {
  await setup(page); await page.goto('/workout?day=1');
  await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click();
  await page.getByRole('button', { name: 'Gestisci ordine ed esercizi' }).click();
  await page.getByRole('button', { name: 'Aggiungi esercizio', exact: true }).click();
  const sheet = page.locator('dialog.bottom-sheet[open]').last();
  await page.getByRole('textbox', { name: 'Cerca esercizio' }).click();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 483 });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 310 });
    Object.defineProperty(window.visualViewport!, 'pageTop', { configurable: true, get: () => 734 });
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 734 });
    window.setTimeout(() => window.visualViewport!.dispatchEvent(new Event('resize')), 80);
  });
  await expect.poll(() => sheet.evaluate(element => element.style.getPropertyValue('--sheet-viewport-top'))).toBe('310px');
  await expect.poll(() => sheet.evaluate(element => element.style.getPropertyValue('--sheet-viewport-height'))).toBe('483px');
  const rect = await sheet.boundingBox();
  expect(rect!.y - 310).toBeCloseTo(0, 0);
  expect(rect!.height).toBeCloseTo(483, 0);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 852 });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 0 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(sheet).not.toHaveClass(/keyboard-open/);
  await expect.poll(() => sheet.evaluate(element => element.style.getPropertyValue('--sheet-viewport-height'))).toBe('852px');
});

test('tab navigation resets scroll and compact buttons fill a single row', async ({ page }) => {
  await setup(page);
  const buttons = page.getByRole('button', { name: 'Visualizza', exact: true }).first().locator('xpath=..').getByRole('button');
  const boxes = await buttons.evaluateAll(items => items.map(item => item.getBoundingClientRect().top)); expect(new Set(boxes).size).toBe(1);
  await expect(page.locator('.plan-card').first().getByRole('button', { name: 'Modifica', exact: true })).toHaveText('');
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Oggi', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page.locator('.activity-badge')).not.toContainText('sedute questa settimana');
  await expect(page.locator('.sync-indicator svg')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recupero', exact: true })).toBeVisible();
  await expect(page.getByText('Come viene stimato', { exact: true })).toHaveCount(0);
});
test('confirmation sheets stay bottom anchored without a header close button', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Modifica', exact: true }).first().click();
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  const sheet = page.getByRole('dialog'); await expect(sheet).toContainText('Lasciare le modifiche?');
  await sheet.locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await expect(sheet.locator('.sheet-header button')).toHaveCount(0);
  await expect(page.locator('dialog:not(.bottom-sheet)')).toHaveCount(0);
  const panel = await sheet.locator('.sheet-panel').boundingBox(); expect(panel!.y + panel!.height).toBeCloseTo(844, 0);
  await sheet.getByRole('button', { name: 'Annulla', exact: true }).click(); await expect(sheet).not.toBeVisible();
});
test('backdrop extends beyond viewport and restores status bar tint on close', async ({ page }) => {
  await setup(page); const originalTint = await page.locator('meta[name="theme-color"]').getAttribute('content');
  await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const scrim = await page.getByRole('dialog').evaluate(el => { const style = getComputedStyle(el, '::backdrop'); return { top: parseFloat(style.top), left: parseFloat(style.left), bottom: parseFloat(style.bottom), position: style.position }; });
  expect(scrim.position).toBe('fixed'); expect(scrim.top).toBeLessThan(0); expect(scrim.left).toBeLessThan(0); expect(scrim.bottom).toBeLessThan(0);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#14201b');
  await expect(page.locator('html')).toHaveClass(/sheet-is-open/);
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', originalTint!);
  await expect(page.locator('html')).not.toHaveClass(/sheet-is-open/);
});

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
  await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  const sheet = page.getByRole('dialog'); await expect(sheet).toBeVisible();
  await sheet.locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
  const footer = await page.getByRole('dialog').locator('.sheet-footer').boundingBox(); expect(footer!.y + footer!.height).toBeLessThanOrEqual(845);
  await page.getByRole('dialog').locator('.sheet-content').evaluate(element => element.scrollTop = 250);
  expect(await page.getByRole('dialog').locator('.sheet-content').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  const after = await page.getByRole('dialog').locator('.sheet-footer').boundingBox(); expect(after!.y).toBeCloseTo(footer!.y, 0);
  await swipe(page, '.sheet-content', 150); await expect(sheet).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).last().click();
  await expect(sheet).not.toBeVisible(); expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0);
});
test('downward gesture from content at its top dismisses the sheet', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Visualizza', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('dialog').locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await swipe(page, '.plan-view h3', 160); await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('sheet follows visual viewport when keyboard opens and keeps actions reachable', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Modifica', exact: true }).first().click();
  await page.getByRole('button', { name: 'Aggiungi esercizio', exact: true }).first().click();
  await page.getByRole('dialog').locator('.sheet-panel').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await page.getByRole('textbox', { name: 'Cerca esercizio' }).fill('panca');
  await page.evaluate(() => { Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 430 }); window.visualViewport!.dispatchEvent(new Event('resize')); });
  await expect(page.getByRole('dialog')).toHaveClass(/keyboard-open/);
  const footer = await page.getByRole('dialog').locator('.sheet-footer').boundingBox(); expect(footer!.y + footer!.height).toBeLessThanOrEqual(431);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).last()).toBeVisible();
});
test('tab navigation resets scroll and compact buttons fill a single row', async ({ page }) => {
  await setup(page); const buttons = page.locator('.plan-card').last().locator('.plan-buttons > button');
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
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#9ca29e');
  await expect(page.locator('html')).toHaveClass(/sheet-is-open/);
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', originalTint!);
  await expect(page.locator('html')).not.toHaveClass(/sheet-is-open/);
});

type ViewportMetrics = {
  visual: number;
  inner: number;
  client: number;
  offsetTop: number;
  pageTop: number;
};

type OpenSheet = {
  dialog: HTMLDialogElement;
  content: HTMLElement;
};

type PageLock = {
  scrollY: number;
  body: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'right' | 'width' | 'overflow' | 'overscrollBehavior' | 'backgroundColor'>;
  html: Pick<CSSStyleDeclaration, 'overflow' | 'overscrollBehavior' | 'backgroundColor'>;
  themeMeta?: HTMLMetaElement;
  themeColor?: string;
};

const openSheets = new Map<HTMLDialogElement, OpenSheet>();
let pageLock: PageLock | undefined;
let baseline: ViewportMetrics | undefined;
let keyboardOpen = false;
let updateFrame = 0;
let focusFrame = 0;
let focusTimer: ReturnType<typeof setTimeout> | undefined;

function readMetrics(): ViewportMetrics {
  const visual = window.visualViewport?.height ?? window.innerHeight;
  return {
    visual,
    inner: window.innerHeight,
    client: document.documentElement.clientHeight || window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
    pageTop: window.visualViewport?.pageTop ?? window.scrollY,
  };
}

function usableHeight(metrics: ViewportMetrics) {
  // visualViewport is the measured visible region after WebKit pans/resizes for
  // the keyboard. clientHeight can exclude the top safe area in standalone mode.
  return Math.max(1, metrics.visual || metrics.inner);
}

function textInputIsFocused() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || ![...openSheets.values()].some(sheet => sheet.dialog.contains(active))) return false;
  if (active.matches('textarea, [contenteditable="true"]')) return !active.hasAttribute('readonly');
  if (!active.matches('input')) return false;
  if (active.hasAttribute('readonly') || active.hasAttribute('disabled')) return false;
  return !/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test((active as HTMLInputElement).type);
}

function savePageLock(): PageLock {
  const body = document.body;
  const html = document.documentElement;
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]') ?? undefined;
  const saved: PageLock = {
    scrollY: window.scrollY,
    body: { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow, overscrollBehavior: body.style.overscrollBehavior, backgroundColor: body.style.backgroundColor },
    html: { overflow: html.style.overflow, overscrollBehavior: html.style.overscrollBehavior, backgroundColor: html.style.backgroundColor },
    themeMeta,
    themeColor: themeMeta?.content,
  };

  // Lock the document's scroll position while the native modal is open.
  html.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `${-saved.scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overscrollBehavior = 'none';
  html.style.backgroundColor = '#14201b';
  body.style.backgroundColor = '#14201b';
  html.classList.add('sheet-is-open');
  themeMeta?.setAttribute('content', '#14201b');
  return saved;
}

function restorePageLock(saved: PageLock) {
  const body = document.body;
  const html = document.documentElement;
  body.style.position = saved.body.position;
  body.style.top = saved.body.top;
  body.style.left = saved.body.left;
  body.style.right = saved.body.right;
  body.style.width = saved.body.width;
  body.style.overflow = saved.body.overflow;
  body.style.overscrollBehavior = saved.body.overscrollBehavior;
  body.style.backgroundColor = saved.body.backgroundColor;
  html.style.overflow = saved.html.overflow;
  html.style.overscrollBehavior = saved.html.overscrollBehavior;
  html.style.backgroundColor = saved.html.backgroundColor;
  html.classList.remove('sheet-is-open');
  if (saved.themeMeta && saved.themeColor !== undefined) saved.themeMeta.content = saved.themeColor;
  if (Math.abs(window.scrollY - saved.scrollY) > 1) window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
}

function adjustFocusedField() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  const sheet = [...openSheets.values()].reverse().find(item => item.dialog.contains(active));
  if (!sheet) return;
  const area = sheet.content.getBoundingClientRect();
  const field = active.getBoundingClientRect();
  const inset = 12;
  if (field.bottom > area.bottom - inset) sheet.content.scrollTop += field.bottom - area.bottom + inset;
  else if (field.top < area.top + inset) sheet.content.scrollTop -= area.top + inset - field.top;
}

function scheduleFocusAdjustment(delay = 0) {
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => {
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => requestAnimationFrame(adjustFocusedField));
  }, delay);
}

function updateViewport() {
  const metrics = readMetrics();
  if (!baseline) baseline = metrics;
  const heightShrunk = (['visual', 'inner', 'client'] as const)
    .some(key => baseline![key] - metrics[key] > 100);
  const viewportPanned = Math.abs(metrics.offsetTop - baseline.offsetTop) > 80;
  const wasKeyboardOpen = keyboardOpen;

  if (keyboardOpen) {
    // Wait for WebKit's visual viewport to recover before releasing the compact layout.
    const viewportRecovered = (['visual', 'inner', 'client'] as const)
      .every(key => metrics[key] >= baseline![key] - 80);
    // pageTop/scrollY can remain panned after the keyboard is dismissed. They
    // describe document position, so don't keep the compact sheet state alive.
    if (viewportRecovered) keyboardOpen = false;
  } else if (textInputIsFocused() && (heightShrunk || viewportPanned)) {
    keyboardOpen = true;
  } else if (!textInputIsFocused()) {
    // Track browser chrome and orientation changes while the keyboard is closed.
    baseline = metrics;
  }

  const height = usableHeight(metrics);
  for (const { dialog } of openSheets.values()) {
    dialog.style.setProperty('--sheet-viewport-height', `${height}px`);
    dialog.style.setProperty('--sheet-viewport-top', `${metrics.offsetTop}px`);
    dialog.classList.toggle('keyboard-open', keyboardOpen);
  }
  if (!wasKeyboardOpen && keyboardOpen) scheduleFocusAdjustment(180);
}

function scheduleViewportUpdate() {
  if (updateFrame) return;
  updateFrame = requestAnimationFrame(() => {
    updateFrame = 0;
    updateViewport();
  });
}

function onFocusIn() {
  scheduleViewportUpdate();
  if (textInputIsFocused()) scheduleFocusAdjustment(180);
}

function onFocusOut() {
  scheduleViewportUpdate();
}

function attachViewportListeners() {
  window.addEventListener('resize', scheduleViewportUpdate);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate);
  // offsetTop/pageTop help identify WebKit's focus pan, but never position the sheet.
}

function detachViewportListeners() {
  window.removeEventListener('resize', scheduleViewportUpdate);
  document.removeEventListener('focusin', onFocusIn);
  document.removeEventListener('focusout', onFocusOut);
  window.visualViewport?.removeEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.removeEventListener('scroll', scheduleViewportUpdate);
  cancelAnimationFrame(updateFrame);
  updateFrame = 0;
  clearTimeout(focusTimer);
  cancelAnimationFrame(focusFrame);
}

export function registerBottomSheet(dialog: HTMLDialogElement, content: HTMLElement) {
  if (openSheets.size === 0) {
    pageLock = savePageLock();
    baseline = readMetrics();
    keyboardOpen = false;
    attachViewportListeners();
  }
  openSheets.set(dialog, { dialog, content });
  updateViewport();

  return () => {
    openSheets.delete(dialog);
    dialog.style.removeProperty('--sheet-viewport-height');
    dialog.style.removeProperty('--sheet-viewport-top');
    dialog.classList.remove('keyboard-open');
    if (openSheets.size === 0) {
      detachViewportListeners();
      keyboardOpen = false;
      baseline = undefined;
      if (pageLock) restorePageLock(pageLock);
      pageLock = undefined;
    }
  };
}

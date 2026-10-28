export type ThemeMode = 'light';
export const loadTheme = (): ThemeMode => 'light';
export function setTheme(_mode: ThemeMode = 'light') {
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = 'light';
  localStorage.setItem('theme', 'light');
}
export function initTheme(): ThemeMode { setTheme(); return 'light'; }

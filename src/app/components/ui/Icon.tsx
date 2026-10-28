import type { CSSProperties } from 'react';
const paths: Record<string, string> = {
  edit: 'm15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-5L4 15Z',
  copy: 'M9 9h11v12H9ZM5 16H3V3h12v2',
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  workout: 'M3 8v8m4-11v14m10-14v14m4-11v8M7 12h10',
  chart: 'M4 4v16h16M8 14l4-5 4 3 5-7',
  book: 'M4 4h13a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3Zm0 13h16M8 8h7M8 12h5',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  back: 'M20 12H4m6-6-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  up: 'M12 20V4m-6 6 6-6 6 6',
  down: 'M12 4v16m-6-6 6 6 6-6',
  sync: 'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
  cloud: 'M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 2 4 4 0 0 1-1 8M9 15l3 3 4-5',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M5 5 3 3m18 18-2-2M5 19l-2 2M21 3l-2 2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
};
export default function Icon({ name, size = 20, className = '', style }: { name: string; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true"><path d={paths[name] ?? paths.workout} /></svg>;
}

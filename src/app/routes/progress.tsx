import { useMemo, useState } from 'react';
import { useSessioni } from '../lib/useSessioni';
import { useLibrary, defaultTemplate, legacyTemplate, type ExerciseTemplate } from '../lib/useTemplate';
import { catalog, exerciseHistory, number, sessionTotals, muscleLabels } from '../lib/training';
import { localDate } from '../lib/date';
import ExerciseHistory from '../components/ui/ExerciseHistory';

type Point = { label: string; value: number };
function Chart({ points, label, unit, bars = false }: { points: Point[]; label: string; unit: string; bars?: boolean }) {
  if (!points.length) return <div className="chart-no-data">Nessun dato nel periodo</div>;
  const maximum = Math.max(1, ...points.map(p => p.value));
  const step = maximum <= 10 ? 2 : 10 ** Math.floor(Math.log10(maximum));
  const top = Math.ceil(maximum / step) * step;
  const x = (i: number) => 55 + (i + .5) * 570 / points.length;
  const y = (v: number) => 185 - v / top * 150;
  const width = Math.min(38, 400 / points.length);
  return <svg className="visual-chart" viewBox="0 0 660 225" role="img" aria-label={`${label}: ${points.map(p => `${p.label}, ${number(p.value)} ${unit}`).join('; ')}`}>
    {[0, 1, 2, 3].map(i => <g key={i}><line x1="50" x2="635" y1={y(top * i / 3)} y2={y(top * i / 3)} stroke="var(--color-border)" strokeDasharray="3 5" /><text x="41" y={y(top * i / 3) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{number(Math.round(top * i / 3))}</text></g>)}
    {!bars && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--color-chart)" strokeWidth="3" strokeLinejoin="round" />}
    {points.map((p, i) => <g key={i}>{bars ? <rect x={x(i) - width / 2} y={y(p.value)} width={width} height={185 - y(p.value)} rx="4" fill="var(--color-chart)"><title>{p.label}: {number(p.value)} {unit}</title></rect> : <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--color-chart)"><title>{p.label}: {number(p.value)} {unit}</title></circle>}{(points.length <= 8 || i === 0 || i === points.length - 1) && <text x={x(i)} y="212" textAnchor="middle" fontSize="11" fill="var(--color-muted)">{p.label}</text>}</g>)}
  </svg>;
}
export default function ProgressRoute() {
  const { data: sessions = [] } = useSessioni(); const { data: library } = useLibrary();
  const [selected, setSelected] = useState(''); const [period, setPeriod] = useState('90'); const [reps, setReps] = useState('all'); const [history, showHistory] = useState<ExerciseTemplate | null>(null);
  const exercises = useMemo(() => catalog(sessions, [...(library?.templates ?? [defaultTemplate]), legacyTemplate]), [sessions, library]);
  const tracked = exercises.filter(e => exerciseHistory(sessions, e.exerciseId).length);
  const exercise = exercises.find(e => e.exerciseId === selected) ?? tracked[0] ?? exercises[0];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(period));
  const inPeriod = (date: string) => date <= localDate() && (period === 'all' || date >= localDate(cutoff));
  const all = exercise ? exerciseHistory(sessions, exercise.exerciseId) : [];
  const filtered = all.filter(h => inPeriod(h.session.date)).reverse();
  const label = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
  const repOptions = [...new Set(all.flatMap(h => h.sets.filter(s => s.kind !== 'drop').map(s => s.reps)))].sort((a, b) => a - b);
  const loads = filtered.map(h => ({ ...h, eligible: h.sets.filter(s => s.kind !== 'drop' && (reps === 'all' || s.reps === Number(reps))) })).filter(h => h.eligible.length).map(h => ({ label: label(h.session.date), value: Math.max(...h.eligible.map(s => s.weight)) }));
  const completed = sessions.filter(s => s.status === 'completed' && inPeriod(s.date));
  const weeks = Array.from({ length: 8 }, (_, i) => { const start = new Date(); start.setDate(start.getDate() - (start.getDay() + 6) % 7 - (7 - i) * 7); const end = new Date(start); end.setDate(end.getDate() + 6); return { label: label(localDate(start)), value: completed.filter(s => s.date >= localDate(start) && s.date <= localDate(end)).length }; });
  const groups = Object.entries(muscleLabels).map(([id, name]) => ({ label: name, value: completed.reduce((sum, s) => sum + s.entries.reduce((n, entry) => { const info = exercises.find(e => e.exerciseId === entry.exerciseId); return n + (info?.muscleGroup === id ? entry.performedSets.filter(set => set.completed === true || set.completed === undefined && set.reps > 0).length : 0); }, 0), 0) })).filter(p => p.value);
  return <div className="page-stack progress-page"><div className="page-title"><h1>Progressi</h1><select className="input period-select" aria-label="Periodo" value={period} onChange={e => setPeriod(e.target.value)}><option value="30">Ultimi 30 giorni</option><option value="90">Ultimi 90 giorni</option><option value="180">Ultimi 6 mesi</option><option value="all">Tutto lo storico</option></select></div>
    <div className="metrics-grid"><div className="metric-card"><span className="eyebrow">SEDUTE</span><strong>{completed.length}</strong></div><div className="metric-card"><span className="eyebrow">SERIE</span><strong>{completed.reduce((sum, s) => sum + sessionTotals(s).sets, 0)}</strong></div><div className="metric-card"><span className="eyebrow">ESERCIZI</span><strong>{new Set(completed.flatMap(s => s.entries.filter(e => e.performedSets.some(set => set.completed === true || set.completed === undefined && set.reps > 0)).map(e => e.exerciseId))).size}</strong></div></div>
    <section className="panel chart-panel"><div className="section-heading"><h2>Carichi</h2><button className="text-link" onClick={() => exercise && showHistory(exercise)}>Storico serie ↗</button></div><div className="chart-controls"><label className="field"><span>ESERCIZIO</span><select className="input" value={exercise?.exerciseId ?? ''} onChange={e => { setSelected(e.target.value); setReps('all'); }}>{[...tracked, ...exercises.filter(e => !tracked.some(t => t.exerciseId === e.exerciseId))].map(e => <option key={e.exerciseId} value={e.exerciseId}>{e.name}{tracked.some(t => t.exerciseId === e.exerciseId) ? '' : ' · nessun dato'}</option>)}</select></label><label className="field"><span>RIPETIZIONI</span><select className="input" value={reps} onChange={e => setReps(e.target.value)}><option value="all">Tutte · carico massimo</option>{repOptions.map(r => <option key={r} value={r}>{r} ripetizioni</option>)}</select></label></div><div className="chart-stats"><span><strong>{loads.length ? number(loads.at(-1)!.value) : '—'}</strong> kg · ultima</span><span><strong>{loads.length ? number(Math.max(...loads.map(p => p.value))) : '—'}</strong> kg · massimo nel periodo</span></div><Chart points={loads} label="Carico massimo" unit="kg" />{exercise?.loadMode === 'assisted' && <small className="muted">Kg di assistenza: meno kg = meno aiuto</small>}</section>
    <div className="visual-grid"><section className="panel"><h2>Volume per seduta <small>kg</small></h2><Chart points={filtered.map(h => ({ label: label(h.session.date), value: h.volume }))} label="Volume esercizio per seduta" unit="kg" bars /></section><section className="panel"><h2>Allenamenti settimanali</h2><Chart points={weeks} label="Allenamenti per settimana" unit="sedute" bars /><small className="muted">Ultime 8 settimane · periodo selezionato</small></section></div>
    <section className="panel"><h2>Serie per gruppo muscolare</h2><div className="muscle-bars">{groups.length ? groups.sort((a, b) => b.value - a.value).map(group => <div key={group.label}><span>{group.label}</span><div><i style={{ width: `${group.value / Math.max(...groups.map(g => g.value)) * 100}%` }} /></div><strong>{group.value}</strong></div>) : <div className="chart-no-data">Nessuna serie nel periodo</div>}</div></section>
    <ExerciseHistory exercise={history} sessions={sessions} onClose={() => showHistory(null)} />
  </div>;
}

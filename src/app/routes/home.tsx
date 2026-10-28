import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessioni, useSessioneAttiva } from '../lib/useSessioni';
import { useTemplate, useLibrary, sessionDay } from '../lib/useTemplate';
import { catalog, sessionTotals, number } from '../lib/training';
import { calculateRecovery } from '../lib/recovery';
import { localDate } from '../lib/date';
import Icon from '../components/ui/Icon';
import ExerciseArt from '../components/ui/ExerciseArt';
import RecoveryMap from '../components/ui/RecoveryMap';
export default function HomeRoute() {
  const { data: sessions = [] } = useSessioni(); const { data: active } = useSessioneAttiva();
  const { data: template } = useTemplate(); const { data: library } = useLibrary(); const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(interval); }, []);
  const completed = sessions.filter(s => s.status === 'completed');
  const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = completed.filter(s => s.date >= localDate(monday) && s.date <= localDate());
  const recent = completed.slice(0, 3);
  const lastInPlan = completed.find(s => s.templateId === template.templateId);
  const index = template.days.findIndex(d => d.dayId === lastInPlan?.dayId);
  const next = template.days[(index + 1) % template.days.length];
  const day = active ? sessionDay(active, library?.templates) : next;
  const report = calculateRecovery(sessions, catalog(sessions, library?.templates ?? [template]), now);
  return <div className="page-stack dashboard-page"><div className="page-title"><div><p className="eyebrow">{new Date(now).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Pronto per<br /><span>il prossimo set?</span></h1></div><Link to="/history" className="activity-badge" aria-label={`${week.length} sedute questa settimana`}><Icon name="bolt" size={22} /><strong>{week.length}</strong></Link></div>
    <div className="dashboard-top"><section className="today-card"><div className="today-copy"><span className="pill">{active ? 'IN CORSO' : 'PROSSIMA SESSIONE'}</span><h2>{day?.label}</h2><div className="today-meta"><span>{day?.exercises.length} esercizi</span><span>{active ? `${sessionTotals(active).sets} serie fatte` : `${day?.exercises.reduce((sum, e) => sum + e.sets.length, 0)} serie`}</span></div><Link className="hero-button" to={active ? '/workout' : `/workout?day=${next?.dayId}`}>{active ? 'Riprendi' : 'Inizia allenamento'}<Icon name="arrow" size={20} /></Link></div>{day?.exercises[0] && <div className="today-art"><ExerciseArt exercise={day.exercises[0]} /></div>}<span className="today-day" aria-hidden="true">0{day?.dayId}</span></section><div className="week-strip panel"><div className="section-heading"><h2>La tua settimana</h2><Icon name="history" size={18} /></div><div className="week-days">{Array.from({ length: 7 }, (_, i) => { const date = new Date(monday); date.setDate(date.getDate() + i); const key = localDate(date); const done = week.some(s => s.date === key); return <div key={i} className={`${done ? 'done' : ''} ${key === localDate() ? 'today' : ''}`}><span>{['L', 'M', 'M', 'G', 'V', 'S', 'D'][i]}</span><b>{done ? <Icon name="check" size={16} /> : date.getDate()}</b></div>; })}</div><div className="weekly-stat"><strong>{week.reduce((sum, s) => sum + sessionTotals(s).sets, 0)}<small>serie</small></strong><strong>{number(week.reduce((sum, s) => sum + sessionTotals(s).volume, 0))}<small>kg di volume</small></strong></div></div></div>
    <div className="dashboard-main"><section className="program-section"><div className="section-heading section-margin"><h2>Il tuo programma</h2><Link className="text-link" to="/plans">Schede <Icon name="arrow" size={16} /></Link></div><div className="program-cards">{template.days.map((d, i) => <button key={d.dayId} className={`program-card program-${i % 3}`} onClick={() => navigate(`/workout?day=${d.dayId}`)}><div className="program-copy"><span className="eyebrow">GIORNO 0{i + 1}</span><h3>{d.label}</h3><small>{d.exercises.length} esercizi · {d.exercises.reduce((sum, e) => sum + e.sets.length, 0)} serie</small><span className="program-arrow"><Icon name="arrow" size={18} /></span></div>{d.exercises[0] && <ExerciseArt exercise={d.exercises[0]} compact />}</button>)}</div></section><section className="panel recovery-panel"><RecoveryMap report={report} compact /></section></div>
    <section><div className="section-heading section-margin"><h2>Ultime sedute</h2><Link className="text-link" to="/history">Diario <Icon name="arrow" size={16} /></Link></div><div className="panel recent-panel">{recent.length ? recent.map(s => <Link to={`/workout/${s.sessionId}`} className="session-row" key={s.sessionId}><div className="date-tile"><strong>{s.date.slice(8)}</strong><span>{new Date(`${s.date}T12:00:00`).toLocaleDateString('it-IT', { month: 'short' })}</span></div><div className="session-row-main"><strong>{sessionDay(s, library?.templates).label}</strong><small>{sessionTotals(s).sets} serie</small></div><span className="session-volume">{number(sessionTotals(s).volume)} <small>kg</small></span><Icon name="arrow" size={18} /></Link>) : <div className="empty-state"><Icon name="history" size={28} /><h3>Nessuna seduta registrata</h3></div>}</div></section>
  </div>;
}

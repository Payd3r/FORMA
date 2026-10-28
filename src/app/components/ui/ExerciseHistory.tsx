import { Link } from 'react-router-dom';
import { exerciseHistory, number } from '../../lib/training';
import type { Sessione } from '../../lib/idb';
import type { ExerciseTemplate } from '../../lib/useTemplate';
import BottomSheet from './BottomSheet';
export default function ExerciseHistory({ exercise, sessions, onClose }: { exercise: ExerciseTemplate | null; sessions: Sessione[]; onClose: () => void }) {
  const history = exercise ? exerciseHistory(sessions, exercise.exerciseId) : [];
  return <BottomSheet open={!!exercise} title={exercise?.name} description="Le tue serie, una seduta alla volta" onClose={onClose} cancelLabel="Chiudi"><div className="exercise-history">{!history.length && <div className="empty-state">Il primo riferimento lo costruisci oggi. Qui compariranno le serie confermate.</div>}{history.map(({ session, sets }) => <Link to={`/workout/${session.sessionId}`} key={session.sessionId} onClick={onClose} className="history-detail-row"><div><strong>{new Date(`${session.date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</strong><small>{session.templateName ?? 'Scheda precedente'}</small></div><div className="set-chips">{sets.map((s, i) => <span key={i}>{number(s.weight)} × {s.reps}{s.kind === 'drop' ? ' ↘' : ''}</span>)}</div></Link>)}</div></BottomSheet>;
}

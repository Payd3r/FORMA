import { exerciseLibrary } from '../data/exercises';
import { confirmedSets, type Sessione, type SetEseguito } from './idb';
import { sessionDay, type ExerciseTemplate, type WorkoutTemplate } from './useTemplate';
export const muscleLabels: Record<string, string> = { Back: 'Dorso', Chest: 'Petto', Shoulders: 'Spalle', Biceps: 'Bicipiti', Triceps: 'Tricipiti', Legs: 'Gambe', Glutes: 'Glutei', Hamstrings: 'Femorali', Calves: 'Polpacci' };
export const number = (value: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value);
export function exerciseHistory(sessions: Sessione[], exerciseId: string) {
  return sessions.filter(s => s.status === 'completed').map(session => {
    const entry = session.entries.find(e => e.exerciseId === exerciseId);
    const sets = entry ? confirmedSets(session, entry).filter(s => s.reps > 0 && s.weight >= 0) : [];
    return { session, sets, max: sets.length ? Math.max(...sets.map(s => s.weight)) : 0, volume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0) };
  }).filter(row => row.sets.length).sort((a, b) => b.session.date.localeCompare(a.session.date) || b.session.createdAt.localeCompare(a.session.createdAt));
}
export function seedSets(exercise: ExerciseTemplate, sessions: Sessione[]): SetEseguito[] {
  const previousRow = exerciseHistory(sessions, exercise.exerciseId)[0];
  const previous = previousRow?.sets.filter(s => s.kind !== 'drop');
  const previousExercise = previousRow ? sessionDay(previousRow.session).exercises.find(e => e.exerciseId === exercise.exerciseId) : undefined;
  return exercise.sets.map((target, index) => {
    const indexed = previous?.[index];
    const reference = indexed && (previousExercise?.sets[index]?.repsTarget === target.repsTarget || indexed.reps >= target.repsTarget) ? indexed : previous?.find(s => s.reps === target.repsTarget);
    return { setIndex: index + 1, weight: reference?.weight ?? 0, weightString: reference ? String(reference.weight) : '', reps: target.repsTarget, repsString: String(target.repsTarget), completed: false, kind: 'normal', weightPrefilled: !!reference };
  });
}
export function suggestion(exercise: ExerciseTemplate, sessions: Sessione[]) {
  const history = exerciseHistory(sessions, exercise.exerciseId);
  if (!history.length) return { title: 'Trova il tuo punto di partenza', detail: 'Primo allenamento per questo esercizio. Il carico lo scegli tu.' };
  if (exercise.loadMode === 'assisted') return { title: 'Tieni d’occhio l’assistenza', detail: 'Confronta le ripetizioni alla stessa assistenza. Meno kg indicano meno aiuto dalla macchina.' };
  if (exercise.technique === 'ramp') return { title: 'La tua rampa, già pronta', detail: 'Imposta il primo carico e usa “Applica rampa”: +2 kg in salita, poi ritorno.' };
  const consistent = history.length >= 2 && history.slice(0, 2).every(h => {
    const sets = h.sets.filter(s => s.kind !== 'drop');
    return sets.length >= exercise.sets.length && exercise.sets.every((target, i) => sets[i].reps >= target.repsTarget && sets[i].weight === history[0].sets.filter(s => s.kind !== 'drop')[i]?.weight);
  });
  return consistent
    ? { title: `Puoi valutare +${number(exercise.increment ?? 2.5)} kg`, detail: 'Target raggiunti nelle ultime due sedute agli stessi carichi. Decidi tu se aumentare.' }
    : { title: 'Riparti dall’ultima volta', detail: 'Carichi precedenti proposti. Modificali liberamente, poi conferma ogni serie eseguita.' };
}
export function sessionTotals(session: Sessione) {
  const sets = session.entries.flatMap(e => confirmedSets(session, e));
  return { sets: sets.length, volume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0), exercises: session.entries.filter(e => confirmedSets(session, e).length > 0).length };
}
export function catalog(sessions: Sessione[], templates: WorkoutTemplate[]): ExerciseTemplate[] {
  const map = new Map<string, ExerciseTemplate>();
  for (const template of templates) for (const day of template.days) for (const exercise of day.exercises) if (!map.has(exercise.exerciseId)) map.set(exercise.exerciseId, exercise);
  for (const session of sessions) for (const exercise of sessionDay(session, templates).exercises) if (!map.has(exercise.exerciseId)) map.set(exercise.exerciseId, exercise);
  for (const exercise of exerciseLibrary) if (!map.has(exercise.exerciseId)) map.set(exercise.exerciseId, exercise);
  return [...map.values()];
}
export function parseInput(value: string) { const normalized = value.replace(',', '.').trim(); if (!normalized) return undefined; const n = Number(normalized); return Number.isFinite(n) && n >= 0 ? n : undefined; }

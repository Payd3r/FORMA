import { confirmedSets, type Sessione, type SetEseguito } from './idb';
import { sessionDay, defaultTemplate, legacyTemplate, type ExerciseTemplate } from './useTemplate';

/** All outputs are transparent training-log heuristics, not physiological measurements. */
export const RECOVERY_METHOD = 'Carico recente stimato dalle serie confermate, con contributi indiretti e decadimento nel tempo. Non misura il recupero fisiologico, sonno o dolore';
export const recoveryLabels: Record<string, string> = { Back: 'Dorso', Chest: 'Petto', Shoulders: 'Spalle', Biceps: 'Bicipiti', Triceps: 'Tricipiti', Legs: 'Gambe', Glutes: 'Glutei', Hamstrings: 'Femorali', Calves: 'Polpacci' };
export type TimedSet = SetEseguito & { completedAt?: string; restSeconds?: number };
export type MuscleRecovery = { muscleGroup: string; label: string; status: 'recent' | 'recovering' | 'lighter' | 'unknown'; hoursSinceLast?: number; weightedSets: number; recentLoad: number; baselineLoad: number; confidence: 'low' | 'medium'; reason: string };
export type RecoveryReport = { groups: MuscleRecovery[]; method: string; observedSessions: number };
export type RestRecommendation = { seconds: number; source: 'plan' | 'history' | 'default'; sampleCount: number; reasons: string[] };
const HOUR = 3_600_000;
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const median = (numbers: number[]) => { const sorted = [...numbers].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
/** Read explicit legacy notes such as 90s, 2m, 2-3m. Use upper bound of ranges. */
export function parseRestNote(note?: string): number | undefined {
  if (!note) return undefined;
  const match = note.toLowerCase().match(/(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(min(?:uti)?|m|sec(?:ondi)?|s)\b/);
  if (!match) return undefined;
  const value = Number((match[2] ?? match[1]).replace(',', '.'));
  const seconds = value * (match[3].startsWith('m') ? 60 : 1);
  return seconds >= 15 && seconds <= 600 ? seconds : undefined;
}
function isCompound(exercise: ExerciseTemplate) {
  return /panca|chest_press|military|shoulder_press|rematore|pulley|lat_machine|trazion|squat|pressa|stacco|affondi|bulgar|hip_thrust|dip_/.test(exercise.exerciseId);
}
/** The muscle map is intentionally conservative: no transfers between distinct load histories. */
export function muscleContributions(exercise: ExerciseTemplate): Record<string, number> {
  const weights: Record<string, number> = {};
  if (exercise.muscleGroup && recoveryLabels[exercise.muscleGroup]) weights[exercise.muscleGroup] = 1;
  const id = exercise.exerciseId;
  const secondary = (group: string, value: number) => { weights[group] = Math.max(weights[group] ?? 0, value); };
  if (/panca|chest_press|dip_petto/.test(id)) { secondary('Triceps', .4); secondary('Shoulders', .3); }
  if (/military|shoulder_press/.test(id)) secondary('Triceps', .4);
  if (/rematore|pulley|lat_machine|lat_pulldown|trazion/.test(id)) secondary('Biceps', .4);
  if (/squat|pressa|affondi|bulgar/.test(id)) secondary('Glutes', .4);
  if (/stacco_rumeno/.test(id)) secondary('Glutes', .5);
  if (/dip_tricipiti/.test(id)) secondary('Chest', .35);
  return weights;
}
function completedTime(session: Sessione, set: TimedSet, now: number): number | undefined {
  if (set.completedAt) {
    const explicit = Date.parse(set.completedAt);
    if (Number.isFinite(explicit) && explicit <= now) return explicit;
  }
  // Old entries have a day but no reliable training time. Use local noon and mark confidence low.
  const day = new Date(`${session.date}T12:00:00`).getTime();
  const today = new Date(now); const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (session.date > localDay || !Number.isFinite(day)) return undefined;
  return Math.min(day, now);
}
/**
 * Recent exposure = weighted sets with 24h model half-life, normalized to the median
 * historical daily dose. This is a log visualization, never a claim that a muscle
 * is ready. Model constants are explicit; the app should display "stima".
 */
export function calculateRecovery(sessions: Sessione[], exercises: ExerciseTemplate[], now = Date.now()): RecoveryReport {
  const unique = [...new Map(sessions.map(s => [s.sessionId, s])).values()];
  const known = new Map(exercises.map(e => [e.exerciseId, e]));
  const exposures = new Map<string, { time: number; units: number; day: string; precise: boolean }[]>();
  let observedSessions = 0;
  for (const session of unique) {
    let observed = false;
    const snapshot = sessionDay(session);
    for (const entry of session.entries) {
      const saved = snapshot.exercises.find(e => e.exerciseId === entry.exerciseId);
      const exercise = saved?.muscleGroup ? saved : known.get(entry.exerciseId);
      if (!exercise) continue;
      const contributions = muscleContributions(exercise);
      for (const raw of confirmedSets(session, entry)) {
        const set = raw as TimedSet;
        if (!Number.isFinite(set.reps) || set.reps <= 0 || !Number.isFinite(set.weight) || set.weight < 0) continue;
        const time = completedTime(session, set, now);
        if (time === undefined || now - time > 56 * 24 * HOUR) continue;
        observed = true;
        // Effort cannot be inferred from kg across machines; count work sets instead.
        // A logged drop is a continuation rather than a full independent work set.
        const units = set.kind === 'drop' ? .5 : 1;
        for (const [group, contribution] of Object.entries(contributions)) {
          const values = exposures.get(group) ?? [];
          values.push({ time, units: units * contribution, day: session.date, precise: !!set.completedAt });
          exposures.set(group, values);
        }
      }
    }
    if (observed) observedSessions++;
  }
  const groups = Object.entries(recoveryLabels).map(([muscleGroup, label]): MuscleRecovery => {
    const history = exposures.get(muscleGroup) ?? [];
    if (!history.length) return { muscleGroup, label, status: 'unknown', weightedSets: 0, recentLoad: 0, baselineLoad: 0, confidence: 'low', reason: 'Nessuna serie registrata nelle ultime 8 settimane' };
    const daily = new Map<string, number>();
    history.forEach(row => daily.set(row.day, (daily.get(row.day) ?? 0) + row.units));
    const baselineLoad = Math.max(3, median([...daily.values()]));
    const recentLoad = history.reduce((sum, row) => sum + row.units * Math.pow(.5, (now - row.time) / (24 * HOUR)), 0);
    const hoursSinceLast = (now - Math.max(...history.map(row => row.time))) / HOUR;
    const relative = recentLoad / baselineLoad;
    const status = hoursSinceLast < 12 ? 'recent' : relative >= .45 ? 'recovering' : 'lighter';
    const weightedSets = history.filter(row => now - row.time <= 7 * 24 * HOUR).reduce((sum, row) => sum + row.units, 0);
    const confidence = daily.size >= 3 && history.every(row => row.precise) ? 'medium' : 'low';
    const reason = `${Math.round(weightedSets * 10) / 10} serie equivalenti negli ultimi 7 giorni · ${daily.size} giorni osservati${confidence === 'low' ? ' · dati parziali' : ''}`;
    return { muscleGroup, label, status, hoursSinceLast, weightedSets, recentLoad, baselineLoad, confidence, reason };
  });
  return { groups, method: RECOVERY_METHOD, observedSessions };
}
/**
 * Explicit plan rest wins. Otherwise learn from >=3 successful, explicitly logged
 * rest intervals after a set, followed by another successful set, in the last 12 completed workouts for this exact exercise.
 * Without enough measured samples, reuse an explicit comparable archived note
 * for the same exercise and recording mode before using generic defaults.
 * Set-to-set elapsed time is NOT rest (it also contains exercise duration).
 */
export function estimateRest(exercise: ExerciseTemplate, sessions: Sessione[], options: { set?: TimedSet; setIndex?: number; now?: number } = {}): RestRecommendation {
  const index = Math.max(0, options.setIndex ?? 0);
  const planSeconds = parseRestNote(exercise.sets[index]?.restNote) ?? exercise.sets.map(s => parseRestNote(s.restNote)).find(v => v !== undefined);
  if (planSeconds !== undefined) return { seconds: planSeconds, source: 'plan', sampleCount: 0, reasons: ['Recupero indicato nella scheda'] };
  const now = options.now ?? Date.now();
  const samples: number[] = [];
  let archivedPlanSeconds: number | undefined;
  const currentTarget = exercise.sets[index]?.repsTarget ?? options.set?.reps ?? 10;
  const currentWeight = options.set?.weight;
  const currentMode = exercise.loadMode ?? 'total';
  const history = [...new Map(sessions.map(session => [session.sessionId, session])).values()].filter(s => s.status === 'completed' && s.entries.some(e => e.exerciseId === exercise.exerciseId)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  for (const session of history) {
    if (new Date(`${session.date}T00:00:00`).getTime() > now) continue;
    const entry = session.entries.find(e => e.exerciseId === exercise.exerciseId);
    if (!session.daySnapshot && ![defaultTemplate.templateId, legacyTemplate.templateId].includes(session.templateId)) continue;
    const savedExercise = sessionDay(session).exercises.find(e => e.exerciseId === exercise.exerciseId);
    // An unknown archived target cannot be replaced by the current plan's target.
    if (!entry || !savedExercise || (savedExercise.loadMode ?? 'total') !== currentMode) continue;
    if (archivedPlanSeconds === undefined) {
      const candidates = [savedExercise.sets[index], ...savedExercise.sets.filter((_, i) => i !== index)];
      const note = candidates.find(target => target && Math.abs(target.repsTarget - currentTarget) <= Math.max(2, currentTarget * .25) && parseRestNote(target.restNote) !== undefined);
      if (note) archivedPlanSeconds = parseRestNote(note.restNote);
    }
    const sets = entry.performedSets as TimedSet[];
    const counts = new Map<number, number>();
    sets.forEach(set => counts.set(set.setIndex, (counts.get(set.setIndex) ?? 0) + 1));
    const isConfirmed = (set: TimedSet) => set.completed === true || set.completed === undefined && session.status === 'completed' && set.reps > 0;
    for (let i = 0; i < sets.length - 1; i++) {
      const set = sets[i]; const following = sets[i + 1];
      // Inspect original neighbors, not the filtered confirmed list: a skipped,
      // removed, duplicate or unconfirmed intermediate set breaks the sample.
      if (!isConfirmed(set) || !isConfirmed(following) || following.setIndex !== set.setIndex + 1 || counts.get(set.setIndex) !== 1 || counts.get(following.setIndex) !== 1) continue;
      const target = savedExercise.sets.find(target => target.setIndex === following.setIndex)?.repsTarget;
      if (set.kind === 'drop' || following.kind === 'drop' || !Number.isFinite(set.restSeconds) || set.restSeconds! < 30 || set.restSeconds! > 600 || target === undefined || following.reps < target) continue;
      if (Math.abs(target - currentTarget) > Math.max(2, currentTarget * .25)) continue;
      if (currentWeight !== undefined && Number.isFinite(currentWeight) && currentWeight > 0 && (following.weight < currentWeight * .7 || following.weight > currentWeight * 1.3)) continue;
      const before = set.completedAt === undefined ? undefined : Date.parse(set.completedAt);
      const after = following.completedAt === undefined ? undefined : Date.parse(following.completedAt);
      if (before !== undefined && (!Number.isFinite(before) || before > now) || after !== undefined && (!Number.isFinite(after) || after > now)) continue;
      // Completion interval includes rest plus the next set's duration, so it
      // cannot be shorter than the explicitly recorded rest itself.
      if (before !== undefined && after !== undefined && after - before < set.restSeconds! * 1000) continue;
      samples.push(set.restSeconds!);
    }
  }
  if (samples.length >= 3) return { seconds: Math.round(clamp(median(samples), 45, 300) / 5) * 5, source: 'history', sampleCount: samples.length, reasons: [`Mediana di ${samples.length} recuperi registrati con target raggiunto`] };
  if (archivedPlanSeconds !== undefined) return { seconds: archivedPlanSeconds, source: 'plan', sampleCount: 0, reasons: ['Recupero della scheda precedente per lo stesso esercizio'] };
  const compound = isCompound(exercise);
  const repsTarget = exercise.sets[index]?.repsTarget ?? options.set?.reps ?? 10;
  let seconds = compound ? repsTarget <= 6 ? 180 : 120 : 90;
  const reasons = [compound ? 'Base per esercizio multiarticolare' : 'Base per esercizio di isolamento'];
  const current = options.set;
  if (current?.completed && current.reps > 0 && current.reps < repsTarget) { seconds += 15; reasons.push('Target non raggiunto: margine di 15 secondi'); }
  return { seconds, source: 'default', sampleCount: samples.length, reasons: [...reasons, samples.length ? `Solo ${samples.length} recuperi confrontabili: ne servono almeno 3` : 'Nessun recupero registrato confrontabile', 'Stima iniziale, modificabile'] };
}
export const recoveryStatusLabels: Record<MuscleRecovery['status'], string> = { recent: 'Appena allenato', recovering: 'Carico residuo', lighter: 'Carico ridotto', unknown: 'Dati assenti' };

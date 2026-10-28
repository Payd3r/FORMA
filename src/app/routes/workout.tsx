import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSessioni, useSessioneAttiva, useSessione, useAvviaSessione, useCompletaSessione, useEliminaSessione } from '../lib/useSessioni';
import { useTemplate, useLibrary, useSaveLibrary, sessionDay, legacyTemplate, type ExerciseTemplate, type DayTemplate } from '../lib/useTemplate';
import { aggiornaSessione, confirmedSets, type Sessione, type SetEseguito } from '../lib/idb';
import { catalog, exerciseHistory, seedSets, suggestion, number, parseInput, muscleLabels, sessionTotals } from '../lib/training';
import { trackSave } from '../lib/saving';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import BottomSheet from '../components/ui/BottomSheet';
import ExerciseHistory from '../components/ui/ExerciseHistory';
import ExercisePicker from '../components/ui/ExercisePicker';
import ExerciseArt from '../components/ui/ExerciseArt';
import RestTimerView from '../components/ui/RestTimer';
import { readRestTimer, writeRestTimer, type RestTimer } from '../lib/restTimer';
import { estimateRest } from '../lib/recovery';

export default function WorkoutRoute() {
  const { sessionId } = useParams(); const [search] = useSearchParams(); const navigate = useNavigate(); const client = useQueryClient();
  const { data: active, isLoading: loadingActive } = useSessioneAttiva(); const { data: viewed, isLoading: loadingViewed } = useSessione(sessionId);
  const { data: sessions = [] } = useSessioni(); const { data: template } = useTemplate(); const { data: library } = useLibrary(); const saveLibrary = useSaveLibrary();
  const start = useAvviaSessione(); const complete = useCompletaSessione(); const remove = useEliminaSessione();
  const source = sessionId ? viewed : active; const readonly = !!sessionId;
  const [session, setSession] = useState<Sessione | null>(null); const current = useRef<Sessione | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve()); const persistedVersion = useRef(''); const outstanding = useRef(0); const saveFailed = useRef(false);
  const [saveState, setSaveState] = useState('Salvato sul dispositivo'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [selectedDay, selectDay] = useState(search.get('day') ?? template.days[0]?.dayId);
  const [history, showHistory] = useState<ExerciseTemplate | null>(null); const [finish, showFinish] = useState(false); const [deleting, showDelete] = useState(false);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null); const [permanent, setPermanent] = useState(false);
  const [removeExercise, setRemoveExercise] = useState<ExerciseTemplate | null>(null);
  const [exerciseId, setExerciseId] = useState(''); const [orderOpen, setOrderOpen] = useState(false);
  const [timer, setTimer] = useState<RestTimer | null>(readRestTimer);
  const [undo, setUndo] = useState<Sessione | null>(null);
  useEffect(() => {
    if (!source) { if (source === null && current.current && !outstanding.current && !readonly) { current.current = null; setSession(null); } return; }
    if (current.current?.sessionId === source.sessionId && (outstanding.current > 0 || source.updatedAt <= persistedVersion.current)) return;
    persistedVersion.current = source.updatedAt;
    const snapshot = structuredClone(source); snapshot.daySnapshot = sessionDay(source, library?.templates);
    // Old active sessions had no explicit confirmation; proposals stay unconfirmed.
    if (snapshot.status === 'in_progress') snapshot.entries = snapshot.entries.map(e => ({ ...e, performedSets: e.performedSets.map(s => ({ ...s, completed: s.completed ?? false })) }));
    current.current = snapshot; setSession(snapshot);
    const savedId = localStorage.getItem(`forma-exercise:${snapshot.sessionId}`);
    setExerciseId(id => snapshot.daySnapshot?.exercises.some(e => e.exerciseId === id) ? id : snapshot.daySnapshot?.exercises.some(e => e.exerciseId === savedId) ? savedId! : snapshot.daySnapshot?.exercises.find(e => { const entry = snapshot.entries.find(v => v.exerciseId === e.exerciseId); return !entry || entry.performedSets.some(set => !set.completed); })?.exerciseId ?? snapshot.daySnapshot?.exercises[0]?.exerciseId ?? '');
  }, [source, library, readonly]);
  function commit(next: Sessione) {
    current.current = next; setSession(next); setError(''); setSaveState('Salvataggio…'); outstanding.current++;
    const save = chain.current.catch(() => {}).then(async () => {
      const result = await aggiornaSessione(next.sessionId, { entries: next.entries, daySnapshot: next.daySnapshot, exerciseOrder: next.daySnapshot?.exercises.map(e => e.exerciseId), sessionNotes: next.sessionNotes });
      if (!result) throw new Error('Sessione non trovata. Ricarica il diario');
      saveFailed.current = false; persistedVersion.current = result.updatedAt;
      client.setQueryData(['sessione', next.sessionId], result);
      client.invalidateQueries({ queryKey: ['sessioni'] }); client.invalidateQueries({ queryKey: ['sessione', 'attiva'] });
    });
    chain.current = trackSave(save);
    save.finally(() => { outstanding.current--; }).catch(() => {});
    save.then(() => { if (!outstanding.current) setSaveState('Salvato sul dispositivo'); }).catch(() => { saveFailed.current = true; setSaveState('Salvataggio non riuscito'); setError('Non riesco a salvare sul dispositivo. Non chiudere questa pagina: riprova il salvataggio'); });
  }
  useEffect(() => { const button = document.querySelector<HTMLElement>('.exercise-stepper [aria-current="step"]'); const stepper = button?.parentElement; if (button && stepper) stepper.scrollLeft = Math.max(0, button.offsetLeft - stepper.offsetLeft - stepper.clientWidth / 3); }, [exerciseId]);
  function updateSet(id: string, index: number, patch: Partial<SetEseguito>) {
    const s = current.current; if (!s) return;
    setUndo(null);
    if (patch.completed === false) { patch = { ...patch, completedAt: undefined, restSeconds: undefined }; if (timer?.exerciseId === id && timer.setIndex === index) { setTimer(null); writeRestTimer(null); } }
    commit({ ...s, entries: s.entries.map(e => e.exerciseId === id ? { ...e, performedSets: e.performedSets.map((set, i) => i === index ? { ...set, ...patch } : set) } : e) });
  }
  function toggleSet(exercise: ExerciseTemplate, index: number) {
    const set = current.current?.entries.find(e => e.exerciseId === exercise.exerciseId)?.performedSets[index]; if (!set) return;
    if (!set.completed && (parseInput(set.weightString ?? String(set.weight)) === undefined || !Number.isInteger(parseInput(set.repsString ?? String(set.reps))) || set.reps <= 0)) { setError('Inserisci un carico valido e almeno una ripetizione prima di confermare'); return; }
    if (set.completed) {
      updateSet(exercise.exerciseId, index, { completed: false, completedAt: undefined, restSeconds: undefined });
      if (timer?.exerciseId === exercise.exerciseId && timer.setIndex === index) { setTimer(null); writeRestTimer(null); }
      return;
    }
    const now = Date.now();
    updateSet(exercise.exerciseId, index, { completed: true, completedAt: new Date(now).toISOString(), restSeconds: undefined });
    if (set.kind !== 'drop' && current.current) {
      const recommendation = estimateRest(exercise, sessions, { set: { ...set, completed: true }, setIndex: index, now });
      const next: RestTimer = { sessionId: current.current.sessionId, exerciseId: exercise.exerciseId, setIndex: index, startedAt: now, deadline: now + recommendation.seconds * 1000, ...recommendation };
      setTimer(next); writeRestTimer(next);
    }
  }
  async function begin() {
    const day = template.days.find(d => d.dayId === selectedDay) ?? template.days[0];
    setError('');
    try { const result = await start.mutateAsync({ templateId: template.templateId, templateName: template.name, dayId: day.dayId, daySnapshot: structuredClone(day), entries: day.exercises.map(e => ({ exerciseId: e.exerciseId, performedSets: seedSets(e, template.baselineAfter ? sessions.filter(s => s.createdAt >= template.baselineAfter!) : sessions) })) });
      if (result.stato === 'avviata') { current.current = result.sessione; setSession(result.sessione); setExerciseId(day.exercises[0]?.exerciseId ?? ''); setTimer(null); writeRestTimer(null); window.scrollTo({ top: 0, behavior: 'instant' }); }
    } catch { setError('Impossibile avviare la sessione. Verifica lo spazio disponibile sul dispositivo'); }
  }
  const baseline = library?.templates.find(t => t.templateId === (session?.templateId ?? template.templateId))?.baselineAfter;
  const progressionSessions = baseline ? sessions.filter(s => s.createdAt >= baseline) : sessions;
  const allExercises = catalog(sessions, [template, ...(library?.templates ?? []), legacyTemplate]);
  function changeExercises(day: DayTemplate, entries = current.current?.entries ?? []) {
    if (!current.current) return;
    if (timer && !day.exercises.some(e => e.exerciseId === timer.exerciseId)) { setTimer(null); writeRestTimer(null); }
    setUndo(structuredClone(current.current)); commit({ ...current.current, daySnapshot: day, entries });
  }
  async function pickExercise(exercise: ExerciseTemplate) {
    const s = current.current; if (!s?.daySnapshot) return;
    if (s.daySnapshot.exercises.some(e => e.exerciseId === exercise.exerciseId && e.exerciseId !== picker?.replace)) { setError('Questo esercizio è già nella sessione'); return; }
    const replaceId = picker?.replace;
    const exercises = replaceId ? s.daySnapshot.exercises.map(e => e.exerciseId === replaceId ? exercise : e) : [...s.daySnapshot.exercises, exercise];
    const entries = [...s.entries.filter(e => e.exerciseId !== replaceId && e.exerciseId !== exercise.exerciseId), { exerciseId: exercise.exerciseId, performedSets: seedSets(exercise, progressionSessions) }];
    changeExercises({ ...s.daySnapshot, exercises }, entries);
    setExerciseId(exercise.exerciseId); localStorage.setItem(`forma-exercise:${s.sessionId}`, exercise.exerciseId);
    if (permanent && library) {
      try { await saveLibrary.mutateAsync({ ...library, templates: library.templates.map(t => t.templateId === s.templateId ? { ...t, days: t.days.map(d => d.dayId === s.dayId ? { ...d, exercises: structuredClone(exercises) } : d) } : t) }); } catch { setError('Sessione aggiornata, ma la modifica alla scheda non è stata salvata. Riprova da Schede'); }
    }
  }
  if (loadingActive || (sessionId && loadingViewed)) return <div className="loading-state">Apro il tuo diario…</div>;
  if (sessionId && !viewed) return <div className="empty-state"><h1>Sessione non trovata</h1><Link to="/history" className="text-link">Torna al diario</Link></div>;
  if (!source && !session) return <div className="page-stack"><div className="page-title"><div><h1>Allenamento</h1></div></div><div className="day-tabs">{template.days.map((d, i) => <button className={selectedDay === d.dayId ? 'active' : ''} key={d.dayId} onClick={() => selectDay(d.dayId)}><span>0{i + 1}</span>{d.label}</button>)}</div><div className="workout-preview"><div className="panel preview-list"><p className="eyebrow">{template.name}</p>{(template.days.find(d => d.dayId === selectedDay) ?? template.days[0]).exercises.map((e, i) => <div className="preview-exercise" key={e.exerciseId}><span className="muted tiny">{String(i + 1).padStart(2, '0')}</span><div><strong>{e.name}</strong><small>{muscleLabels[e.muscleGroup ?? '']} · {e.sets.length} serie × {e.sets.map(s => s.repsTarget).join(' / ')}</small></div><button className="icon-button" aria-label={`Storico ${e.name}`} onClick={() => showHistory(e)}><Icon name="history" /></button></div>)}</div><aside className="start-panel"><span className="round-icon"><Icon name="workout" size={30} /></span><h2>Allenamento</h2><Button onClick={begin} loading={start.isPending}>Inizia allenamento <Icon name="arrow" /></Button></aside></div>{error && <p role="alert" className="error-message">{error}</p>}<ExerciseHistory exercise={history} sessions={sessions} onClose={() => showHistory(null)} /></div>;
  if (!session) return <div className="loading-state">Apro la sessione…</div>;
  const day = session.daySnapshot ?? sessionDay(session, library?.templates);
  const selectedIndex = Math.max(0, day.exercises.findIndex(e => e.exerciseId === exerciseId));
  const selectedExercise = day.exercises[selectedIndex];
  function goTo(id: string) { setExerciseId(id); localStorage.setItem(`forma-exercise:${session!.sessionId}`, id); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function endRest() {
    if (!timer) return;
    const elapsed = Math.round((Date.now() - timer.startedAt) / 1000);
    const target = current.current?.entries.find(e => e.exerciseId === timer.exerciseId)?.performedSets[timer.setIndex];
    if (target?.completed && elapsed >= 30 && elapsed <= 600) updateSet(timer.exerciseId, timer.setIndex, { restSeconds: elapsed });
    setTimer(null); writeRestTimer(null);
  }
  const total = session.entries.reduce((sum, e) => sum + e.performedSets.length, 0); const done = sessionTotals(session).sets;
  return <div className="page-stack workout-page"><div className="page-title"><div><p className="eyebrow">{readonly ? `DIARIO / ${new Date(`${session.date}T12:00:00`).toLocaleDateString('it-IT')}` : 'IL TUO ALLENAMENTO / IN CORSO'}</p><h1>{day.label}</h1><p className="muted">{session.templateName ?? 'Scheda precedente'}{!readonly && <span className="save-label"> · {saveState}</span>}</p></div>{readonly ? <Button variant="secondary" onClick={() => showDelete(true)}><Icon name="trash" size={17} />Elimina seduta</Button> : <Button onClick={() => showFinish(true)} disabled={busy}>Concludi <Icon name="check" size={18} /></Button>}</div>
    {!readonly && <div className="session-progress"><div><span><strong>{done}</strong> / {total} serie confermate</span><span className="muted tiny">{selectedIndex + 1} / {day.exercises.length} esercizi</span></div><div className="progress-track"><span style={{ width: `${total ? done / total * 100 : 0}%` }} /></div></div>}
    {error && <div className="error-message" role="alert">{error}{saveFailed.current && <Button variant="secondary" onClick={() => current.current && commit(current.current)}>Riprova salvataggio</Button>}</div>}
    {undo && !readonly && <div className="notice"><span>Esercizi aggiornati per questa seduta</span><button className="text-link" onClick={() => { commit(undo); setUndo(null); }}>Annulla modifica</button><button className="icon-button" aria-label="Chiudi messaggio" onClick={() => setUndo(null)}><Icon name="close" size={16} /></button></div>}
    {!readonly && <div className="exercise-stepper" aria-label="Esercizi della sessione">{day.exercises.map((e, i) => { const entry = session.entries.find(v => v.exerciseId === e.exerciseId); const finished = !!entry?.performedSets.length && entry.performedSets.every(set => set.completed); return <button key={e.exerciseId} aria-label={`Vai a ${e.name}`} aria-current={i === selectedIndex ? 'step' : undefined} className={`${i === selectedIndex ? 'current' : ''} ${finished ? 'finished' : ''}`} onClick={() => goTo(e.exerciseId)}><span>{finished ? <Icon name="check" size={14} /> : String(i + 1).padStart(2, '0')}</span><small>{e.name}</small></button>; })}<button className="order-trigger" aria-label="Ordine esercizi" onClick={() => setOrderOpen(true)}><Icon name="settings" size={19} /><small>Ordine</small></button></div>}
    <div className={`workout-layout ${!readonly ? 'focused-workout' : ''}`}><div className="exercise-stack">{day.exercises.map((exercise, exerciseIndex) => ({ exercise, exerciseIndex })).filter(({ exerciseIndex }) => readonly || exerciseIndex === selectedIndex).map(({ exercise, exerciseIndex }) => {
      const entry = session.entries.find(e => e.exerciseId === exercise.exerciseId);
      const sets = entry?.performedSets ?? []; const previous = exerciseHistory(sessions.filter(s => s.sessionId !== session.sessionId), exercise.exerciseId)[0];
      const related = exercise.relatedExerciseId ? allExercises.find(e => e.exerciseId === exercise.relatedExerciseId) : undefined;
      const doneCount = entry ? confirmedSets(session, entry).length : 0;
      return <section className={`exercise-panel ${sets.length > 0 && doneCount === sets.length ? 'all-done' : ''}`} key={exercise.exerciseId} id={`ex-${exercise.exerciseId}`}>{!readonly && <div className="exercise-visual"><ExerciseArt exercise={exercise} /><span className="exercise-visual-tag">{muscleLabels[exercise.muscleGroup ?? '']}</span></div>}<div className="exercise-heading"><span className="exercise-index">{String(exerciseIndex + 1).padStart(2, '0')}</span><div className="exercise-name"><p className="eyebrow">{muscleLabels[exercise.muscleGroup ?? ''] ?? 'ESERCIZIO'} {exercise.technique === 'ramp' ? '/ RAMPING' : exercise.technique === 'drop' ? '/ SCALO' : ''}</p><h2>{exercise.name}</h2></div><button className="icon-button" aria-label={`Storico ${exercise.name}`} onClick={() => showHistory(exercise)}><Icon name="history" /></button></div>
      {exercise.incrementNote && <p className="exercise-note">{exercise.incrementNote}</p>}
      {!previous && !readonly && <div className="first-time">Primo carico{related && <button className="text-link" onClick={() => showHistory(related)}>Vedi {related.name} <Icon name="arrow" size={13} /></button>}</div>}
      {!readonly && <details className="exercise-advice"><summary><Icon name="bolt" size={13} />{suggestion(exercise, progressionSessions).title}</summary><p>{suggestion(exercise, progressionSessions).detail}</p></details>}
      <div className="set-table"><div className="set-table-head"><span>SERIE</span><span>PRECEDENTE</span><span>KG</span><span>REPS</span><span>{readonly ? 'FATTA' : 'FATTO'}</span>{!readonly && <span />}</div>{sets.map((set, index) => {
        const isConfirmed = set.completed === true || set.completed === undefined && session.status === 'completed';
        const oldSet = previous?.sets[index];
        return <div className={`set-table-row ${isConfirmed ? 'confirmed' : ''} ${set.kind === 'drop' ? 'drop-row' : ''}`} key={index}><span className="set-index">{set.kind === 'drop' ? '↘' : index + 1}</span><span className="previous-set">{oldSet ? `${number(oldSet.weight)} × ${oldSet.reps}` : '—'}</span><input className="set-input" aria-label={`${exercise.name} serie ${index + 1} kg`} inputMode="decimal" value={set.weightString ?? String(set.weight)} placeholder="—" readOnly={readonly} onChange={e => updateSet(exercise.exerciseId, index, { weightString: e.target.value, weight: parseInput(e.target.value) ?? 0, completed: false, weightPrefilled: false })} /><input className="set-input" aria-label={`${exercise.name} serie ${index + 1} ripetizioni`} inputMode="numeric" value={set.repsString ?? String(set.reps)} placeholder="—" readOnly={readonly} onChange={e => updateSet(exercise.exerciseId, index, { repsString: e.target.value, reps: parseInput(e.target.value) ?? 0, completed: false })} /><button className={`confirm-set ${isConfirmed ? 'checked' : ''}`} disabled={readonly} aria-pressed={isConfirmed} aria-label={`${isConfirmed ? 'Annulla' : 'Conferma'} ${exercise.name} serie ${index + 1}`} onClick={() => toggleSet(exercise, index)}><Icon name="check" size={19} /></button>{!readonly && <button className="remove-set" aria-label={`Rimuovi ${exercise.name} serie ${index + 1}`} onClick={() => { if (timer?.exerciseId === exercise.exerciseId) { setTimer(null); writeRestTimer(null); } setUndo(structuredClone(session)); commit({ ...session, entries: session.entries.map(e => e.exerciseId === exercise.exerciseId ? { ...e, performedSets: e.performedSets.filter((_, i) => i !== index).map((s, i) => ({ ...s, setIndex: i + 1 })) } : e) }); }}><Icon name="close" size={13} /></button>}</div>;
      })}</div>
      {!readonly && <div className="exercise-actions"><button className="text-link" onClick={() => { const last = sets.at(-1); commit({ ...session, entries: session.entries.map(e => e.exerciseId === exercise.exerciseId ? { ...e, performedSets: [...e.performedSets, { setIndex: sets.length + 1, weight: last?.weight ?? 0, reps: last?.reps ?? 10, weightString: last?.weightString ?? '', repsString: last?.repsString ?? '10', completed: false, kind: 'normal' }] } : e) }); }}><Icon name="plus" size={15} />Serie</button>
      {exercise.technique !== 'ramp' && <button className="text-link" title="Aumenta solo le serie non confermate che hanno già un carico" onClick={() => { const step = exercise.increment ?? 2.5; if (!sets.some(s => !s.completed && parseInput(s.weightString ?? String(s.weight)) !== undefined)) { setError('Inserisci prima un carico nelle serie da aumentare'); return; } commit({ ...session, entries: session.entries.map(e => e.exerciseId === exercise.exerciseId ? { ...e, performedSets: e.performedSets.map(s => !s.completed && parseInput(s.weightString ?? String(s.weight)) !== undefined ? { ...s, weight: Math.round((s.weight + step) * 100) / 100, weightString: String(Math.round((s.weight + step) * 100) / 100) } : s) } : e) }); }}>+{number(exercise.increment ?? 2.5)} kg</button>}
      {exercise.technique === 'drop' && <button className="text-link" onClick={() => commit({ ...session, entries: session.entries.map(e => e.exerciseId === exercise.exerciseId ? { ...e, performedSets: [...e.performedSets, { setIndex: sets.length + 1, weight: 0, reps: 0, weightString: '', repsString: '', completed: false, kind: 'drop' }] } : e) })}>↘ Scalo</button>}
      {exercise.technique === 'ramp' && <button className="text-link" onClick={() => { const base = parseInput(sets[0]?.weightString ?? ''); if (base === undefined) { setError('Inserisci prima il peso della prima serie'); return; } commit({ ...session, entries: session.entries.map(e => e.exerciseId === exercise.exerciseId ? { ...e, performedSets: e.performedSets.map((s, i) => s.completed ? s : { ...s, weight: base + (exercise.weightOffsets?.[i] ?? 0), weightString: String(base + (exercise.weightOffsets?.[i] ?? 0)) }) } : e) }); }}>Applica rampa +2 kg</button>}
      <div className="exercise-tools"><button className="text-link muted" onClick={() => { setPermanent(false); setPicker({ replace: exercise.exerciseId }); }}>Sostituisci</button><button className="icon-button" disabled={exerciseIndex === 0} aria-label={`Sposta su ${exercise.name}`} onClick={() => { const exercises = [...day.exercises]; [exercises[exerciseIndex - 1], exercises[exerciseIndex]] = [exercises[exerciseIndex], exercises[exerciseIndex - 1]]; changeExercises({ ...day, exercises }); }}><Icon name="up" size={15} /></button><button className="icon-button" disabled={exerciseIndex === day.exercises.length - 1} aria-label={`Sposta giù ${exercise.name}`} onClick={() => { const exercises = [...day.exercises]; [exercises[exerciseIndex + 1], exercises[exerciseIndex]] = [exercises[exerciseIndex], exercises[exerciseIndex + 1]]; changeExercises({ ...day, exercises }); }}><Icon name="down" size={15} /></button><button className="icon-button danger-text" aria-label={`Rimuovi esercizio ${exercise.name}`} onClick={() => setRemoveExercise(exercise)}><Icon name="trash" size={15} /></button></div></div>}
      </section>;
    })}{!readonly && <button className="add-exercise" onClick={() => { setPermanent(false); setPicker({}); }}><Icon name="plus" /> Aggiungi esercizio</button>}
    <section className="panel"><label className="eyebrow" htmlFor="session-notes">APPUNTI DELLA SEDUTA</label><textarea id="session-notes" className="notes-input" placeholder="Una sensazione, un dettaglio da ricordare…" value={session.sessionNotes ?? ''} readOnly={readonly} onChange={e => commit({ ...session, sessionNotes: e.target.value })} /></section>
    </div>{!readonly && <aside className="focus-side"><div className="focus-summary"><span className="eyebrow">SESSIONE</span><strong>{done}<small> / {total} serie</small></strong><div className="progress-track"><span style={{ width: `${total ? done / total * 100 : 0}%` }} /></div><button className="text-link" onClick={() => setOrderOpen(true)}>Gestisci ordine <Icon name="settings" size={16} /></button></div>{timer?.sessionId === session.sessionId && <RestTimerView timer={timer} onEnd={endRest} onExtend={() => { const next = { ...timer, deadline: timer.deadline + 30000, seconds: timer.seconds + 30 }; setTimer(next); writeRestTimer(next); }} />}</aside>}</div>
    {!readonly && <><div className="exercise-navigation"><Button variant="secondary" aria-label="Esercizio precedente" disabled={selectedIndex === 0} onClick={() => goTo(day.exercises[selectedIndex - 1].exerciseId)}><Icon name="back" size={19} />Precedente</Button><span>{selectedIndex + 1}<small> / {day.exercises.length}</small></span>{selectedIndex < day.exercises.length - 1 ? <Button aria-label="Esercizio successivo" onClick={() => goTo(day.exercises[selectedIndex + 1].exerciseId)}>Successivo<Icon name="arrow" size={19} /></Button> : <Button onClick={() => showFinish(true)}>Salva sessione<Icon name="check" size={19} /></Button>}</div>{selectedExercise && <div className="next-exercise-label">{day.exercises[selectedIndex + 1] ? `Dopo: ${day.exercises[selectedIndex + 1].name}` : 'Ultimo esercizio'}</div>}</>}
    <BottomSheet open={orderOpen} title="Ordine esercizi" cancelLabel="Chiudi" onClose={() => setOrderOpen(false)}><div className="order-list">{day.exercises.map((e, i) => <div key={e.exerciseId}><button className="order-exercise" onClick={() => { goTo(e.exerciseId); setOrderOpen(false); }}><span>{i + 1}</span><strong>{e.name}</strong></button><button className="icon-button" disabled={i === 0} aria-label={`Sposta su ${e.name}`} onClick={() => { const exercises = [...day.exercises]; [exercises[i - 1], exercises[i]] = [exercises[i], exercises[i - 1]]; changeExercises({ ...day, exercises }); }}><Icon name="up" size={17} /></button><button className="icon-button" disabled={i === day.exercises.length - 1} aria-label={`Sposta giù ${e.name}`} onClick={() => { const exercises = [...day.exercises]; [exercises[i + 1], exercises[i]] = [exercises[i], exercises[i + 1]]; changeExercises({ ...day, exercises }); }}><Icon name="down" size={17} /></button></div>)}</div></BottomSheet>
    <ExerciseHistory exercise={history} sessions={sessions} onClose={() => showHistory(null)} />
    <ExercisePicker open={!!picker} exercises={allExercises} onClose={() => setPicker(null)} onPick={e => { void pickExercise(e); }}><div className="picker-scope"><label><input type="checkbox" checked={permanent} onChange={e => setPermanent(e.target.checked)} />Salva la modifica anche nella scheda</label></div></ExercisePicker>
    <BottomSheet open={!!removeExercise} title="Rimuovere questo esercizio?" description={`${removeExercise?.name ?? ''}: le sue serie verranno rimosse solo da questa seduta. Puoi annullare subito dopo`} tone="danger" confirmLabel="Rimuovi esercizio" onClose={() => setRemoveExercise(null)} onConfirm={() => { changeExercises({ ...day, exercises: day.exercises.filter(e => e.exerciseId !== removeExercise?.exerciseId) }, session.entries.filter(e => e.exerciseId !== removeExercise?.exerciseId)); setExerciseId(day.exercises.find(e => e.exerciseId !== removeExercise?.exerciseId)?.exerciseId ?? ''); }} />
    <BottomSheet open={finish} title="Concludi sessione" description={`${done} serie confermate su ${total}. Solo le serie confermate entrano nello storico`} confirmLabel="Salva e concludi" onClose={() => showFinish(false)} onConfirm={async () => { if (!done) throw new Error('Conferma almeno una serie prima di concludere'); setBusy(true); try { await chain.current; if (saveFailed.current) throw new Error('Attendi il salvataggio delle ultime modifiche'); await complete.mutateAsync({ sessionId: session.sessionId }); setTimer(null); writeRestTimer(null); current.current = null; setSession(null); navigate('/history'); } finally { setBusy(false); } }} />
    <BottomSheet open={deleting} title="Eliminare questa seduta?" description="La cancellazione verrà sincronizzata anche sugli altri dispositivi" confirmLabel="Elimina seduta" tone="danger" onClose={() => showDelete(false)} onConfirm={async () => { await remove.mutateAsync({ sessionId: session.sessionId }); navigate('/history'); }} />
  </div>;
}

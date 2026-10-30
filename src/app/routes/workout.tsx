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
import HeaderRestTimer from '../components/ui/HeaderRestTimer';
import ElapsedStopwatch from '../components/ui/ElapsedStopwatch';
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
  const [cancelling, showCancel] = useState(false);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [removeExercise, setRemoveExercise] = useState<ExerciseTemplate | null>(null);
  const [exerciseId, setExerciseId] = useState(''); const [orderOpen, setOrderOpen] = useState(false);
  const [timer, setTimer] = useState<RestTimer | null>(readRestTimer);
  const [lastSetCompletedAt, setLastSetCompletedAt] = useState<number | null>(null);
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
    const save = chain.current.catch(() => { }).then(async () => {
      const result = await aggiornaSessione(next.sessionId, { entries: next.entries, daySnapshot: next.daySnapshot, exerciseOrder: next.daySnapshot?.exercises.map(e => e.exerciseId), sessionNotes: next.sessionNotes });
      if (!result) throw new Error('Sessione non trovata. Ricarica il diario');
      saveFailed.current = false; persistedVersion.current = result.updatedAt;
      client.setQueryData(['sessione', next.sessionId], result);
      client.invalidateQueries({ queryKey: ['sessioni'] }); client.invalidateQueries({ queryKey: ['sessione', 'attiva'] });
    });
    chain.current = trackSave(save);
    save.finally(() => { outstanding.current--; }).catch(() => { });
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
    setLastSetCompletedAt(now);
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
    try {
      const result = await start.mutateAsync({ templateId: template.templateId, templateName: template.name, dayId: day.dayId, daySnapshot: structuredClone(day), entries: day.exercises.map(e => ({ exerciseId: e.exerciseId, performedSets: seedSets(e, template.baselineAfter ? sessions.filter(s => s.createdAt >= template.baselineAfter!) : sessions) })) });
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
  async function pickExercise(picked: ExerciseTemplate | ExerciseTemplate[]) {
    const s = current.current; if (!s?.daySnapshot) return;
    const pickedArray = Array.isArray(picked) ? picked : [picked];
    if (pickedArray.length === 0) return;

    const replaceId = picker?.replace;
    if (replaceId && pickedArray.length === 1) {
      const exercise = pickedArray[0];
      if (s.daySnapshot.exercises.some(e => e.exerciseId === exercise.exerciseId && e.exerciseId !== replaceId)) {
        setError('Questo esercizio è già nella sessione');
        return;
      }
      const exercises = s.daySnapshot.exercises.map(e => e.exerciseId === replaceId ? exercise : e);
      const entries = [...s.entries.filter(e => e.exerciseId !== replaceId && e.exerciseId !== exercise.exerciseId), { exerciseId: exercise.exerciseId, performedSets: seedSets(exercise, progressionSessions) }];
      changeExercises({ ...s.daySnapshot, exercises }, entries);
      setExerciseId(exercise.exerciseId);
      localStorage.setItem(`forma-exercise:${s.sessionId}`, exercise.exerciseId);
      return;
    }

    // Aggiunta singola o multipla
    const validToAdd = pickedArray.filter(
      exercise => !s.daySnapshot.exercises.some(e => e.exerciseId === exercise.exerciseId)
    );
    if (validToAdd.length === 0) {
      setError('Tutti gli esercizi selezionati sono già presenti nella sessione');
      return;
    }

    const exercises = [...s.daySnapshot.exercises, ...validToAdd];
    const newEntries = validToAdd.map(exercise => ({
      exerciseId: exercise.exerciseId,
      performedSets: seedSets(exercise, progressionSessions),
    }));
    const entries = [...s.entries, ...newEntries];
    changeExercises({ ...s.daySnapshot, exercises }, entries);
    setExerciseId(validToAdd[0].exerciseId);
    localStorage.setItem(`forma-exercise:${s.sessionId}`, validToAdd[0].exerciseId);
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
  const sessionDateFormatted = new Date(`${session.date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

  return <div className={`page-stack workout-page ${!readonly ? 'workout-active-mode' : 'workout-readonly-mode'}`}>
      {!readonly ? (
        <header className="active-workout-header">
          <div className="active-header-top-row">
            <button className="active-cancel-btn" title="Annulla o elimina seduta" aria-label="Annulla seduta" onClick={() => showCancel(true)}>
              <Icon name="close" size={18} />
            </button>

            {lastSetCompletedAt ? (
              <ElapsedStopwatch resetKey={lastSetCompletedAt} />
            ) : null}

            <div className="active-header-actions">
              <button className="active-order-btn" title="Ordine ed esercizi" aria-label="Gestisci ordine ed esercizi" onClick={() => setOrderOpen(true)}>
                <Icon name="settings" size={17} />
              </button>
              <Button className="active-finish-top-btn" onClick={() => showFinish(true)} disabled={busy}>
                Concludi <Icon name="check" size={15} />
              </Button>
            </div>
          </div>

          {/* Stepper compatto in header: solo numeri, sta in una riga */}
          <div className="active-header-stepper-row" aria-label="Esercizi della sessione">
            {day.exercises.map((e, i) => {
              const entry = session.entries.find(v => v.exerciseId === e.exerciseId);
              const finished = !!entry?.performedSets.length && entry.performedSets.every(set => set.completed);
              const isCurrent = i === selectedIndex;
              return (
                <button
                  key={e.exerciseId}
                  aria-label={`Esercizio ${i + 1}: ${e.name}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`active-header-step-pill ${isCurrent ? 'current' : ''} ${finished ? 'finished' : ''}`}
                  onClick={() => goTo(e.exerciseId)}
                >
                  <span className="step-pill-idx">{finished ? <Icon name="check" size={13} /> : String(i + 1).padStart(2, '0')}</span>
                </button>
              );
            })}
          </div>
        </header>
      ) : (
        <header className="readonly-workout-header">
          <div className="readonly-header-title-box">
            <h1 className="readonly-header-name">{day.label}</h1>
            <span className="readonly-header-date">{sessionDateFormatted}</span>
          </div>
        </header>
      )}
      {error && <div className="error-message" role="alert">{error}{saveFailed.current && <Button variant="secondary" onClick={() => current.current && commit(current.current)}>Riprova salvataggio</Button>}</div>}
      <div className={`workout-layout ${!readonly ? 'focused-workout' : ''}`}><div className="exercise-stack">{day.exercises.map((exercise, exerciseIndex) => ({ exercise, exerciseIndex })).filter(({ exerciseIndex }) => readonly || exerciseIndex === selectedIndex).map(({ exercise, exerciseIndex }) => {
        const entry = session.entries.find(e => e.exerciseId === exercise.exerciseId);
        const sets = entry?.performedSets ?? []; const previous = exerciseHistory(sessions.filter(s => s.sessionId !== session.sessionId), exercise.exerciseId)[0];
        const hasPrevious = !!previous?.sets?.length;
        const doneCount = entry ? confirmedSets(session, entry).length : 0;
        return <section className={`exercise-panel ${sets.length > 0 && doneCount === sets.length ? 'all-done' : ''}`} key={exercise.exerciseId} id={`ex-${exercise.exerciseId}`}>
          {!readonly && <div className="exercise-visual"><ExerciseArt exercise={exercise} /></div>}
          <div className="exercise-heading">
            <div className="exercise-name">
              <span className="exercise-muscle-tag">{muscleLabels[exercise.muscleGroup ?? ''] ?? 'ESERCIZIO'}{exercise.technique === 'ramp' ? ' · RAMPING' : exercise.technique === 'drop' ? ' · SCALO' : ''}</span>
              <h2 className="exercise-hero-title">{exercise.name}</h2>
            </div>
          </div>
          {exercise.incrementNote && <p className="exercise-note">{exercise.incrementNote}</p>}
          <div className={`set-table ${!hasPrevious ? 'no-previous' : ''}`}>
            <div className="set-table-head">
              <span>SERIE</span>{hasPrevious && <span>PRECEDENTE</span>}<span>KG</span><span>REPS</span><span>{readonly ? 'FATTA' : 'FATTO'}</span>{!readonly && <span />}
            </div>
            {sets.length === 0 ? (
              <div className="empty-sets-prompt">
                <p>Nessuna serie registrata per questo esercizio</p>
                {!readonly && (
                  <Button variant="secondary" onClick={() => {
                    commit({ ...session, entries: session.entries.map(e => e.exerciseId === exercise.exerciseId ? { ...e, performedSets: [{ setIndex: 1, weight: 0, reps: 10, weightString: '', repsString: '10', completed: false, kind: 'normal' }] } : e) });
                  }}>
                    <Icon name="plus" size={15} /> Inizia con la prima serie
                  </Button>
                )}
              </div>
            ) : (
              sets.map((set, index) => {
                const isConfirmed = set.completed === true || set.completed === undefined && session.status === 'completed';
                const oldSet = previous?.sets[index];
                return <div className={`set-table-row ${isConfirmed ? 'confirmed' : ''} ${set.kind === 'drop' ? 'drop-row' : ''}`} key={index}>
                  <span className="set-index">{set.kind === 'drop' ? '↘' : index + 1}</span>
                  {hasPrevious && <span className="previous-set">{oldSet ? `${number(oldSet.weight)} × ${oldSet.reps}` : '—'}</span>}
                  <input className="set-input" aria-label={`${exercise.name} serie ${index + 1} kg`} inputMode="decimal" value={set.weightString ?? String(set.weight)} placeholder="—" readOnly={readonly} onChange={e => updateSet(exercise.exerciseId, index, { weightString: e.target.value, weight: parseInput(e.target.value) ?? 0, completed: false, weightPrefilled: false })} />
                  <input className="set-input" aria-label={`${exercise.name} serie ${index + 1} ripetizioni`} inputMode="numeric" value={set.repsString ?? String(set.reps)} placeholder="—" readOnly={readonly} onChange={e => updateSet(exercise.exerciseId, index, { repsString: e.target.value, reps: parseInput(e.target.value) ?? 0, completed: false })} />
                  <button className={`confirm-set ${isConfirmed ? 'checked' : ''}`} disabled={readonly} aria-pressed={isConfirmed} aria-label={`${isConfirmed ? 'Annulla' : 'Conferma'} ${exercise.name} serie ${index + 1}`} onClick={() => toggleSet(exercise, index)}>
                    <Icon name="check" size={19} />
                  </button>
                  {!readonly && <button className="remove-set" aria-label={`Rimuovi ${exercise.name} serie ${index + 1}`} onClick={() => { if (timer?.exerciseId === exercise.exerciseId) { setTimer(null); writeRestTimer(null); } setUndo(structuredClone(session)); commit({ ...session, entries: session.entries.map(e => e.exerciseId === exercise.exerciseId ? { ...e, performedSets: e.performedSets.filter((_, i) => i !== index).map((s, i) => ({ ...s, setIndex: i + 1 })) } : e) }); }}><Icon name="close" size={13} /></button>}
                </div>;
              })
            )}
          </div>
          {!readonly && (
            <div className="exercise-card-footer-actions">
              <button
                className="btn-card-action btn-card-history"
                aria-label={`Storico ${exercise.name}`}
                disabled={!hasPrevious}
                onClick={() => showHistory(exercise)}
              >
                <Icon name="history" size={17} />
                <span>Storico</span>
              </button>
              <button
                className="btn-card-action btn-card-add-set"
                onClick={() => {
                  const last = sets.at(-1);
                  commit({
                    ...session,
                    entries: session.entries.map(e =>
                      e.exerciseId === exercise.exerciseId
                        ? {
                            ...e,
                            performedSets: [
                              ...e.performedSets,
                              {
                                setIndex: sets.length + 1,
                                weight: last?.weight ?? 0,
                                reps: last?.reps ?? 10,
                                weightString: last?.weightString ?? '',
                                repsString: last?.repsString ?? '10',
                                completed: false,
                                kind: 'normal',
                              },
                            ],
                          }
                        : e
                    ),
                  });
                }}
              >
                <Icon name="plus" size={17} />
                <span>Aggiungi serie</span>
              </button>
            </div>
          )}
        </section>;
      })}
        <section className="panel"><label className="eyebrow" htmlFor="session-notes">APPUNTI DELLA SEDUTA</label><textarea id="session-notes" className="notes-input" placeholder="Una sensazione, un dettaglio da ricordare…" value={session.sessionNotes ?? ''} readOnly={readonly} onChange={e => commit({ ...session, sessionNotes: e.target.value })} /></section>
      </div></div>
      {!readonly && (
        <footer className="active-floating-footer">
          <div className="active-footer-content">
            <Button
              variant="secondary"
              className="active-footer-nav-btn"
              aria-label="Esercizio precedente"
              disabled={selectedIndex === 0}
              onClick={() => goTo(day.exercises[selectedIndex - 1].exerciseId)}
            >
              <Icon name="back" size={18} />
              <span>Prec</span>
            </Button>

            <button className="active-footer-step-indicator" onClick={() => setOrderOpen(true)} title="Tocca per riordinare o vedere la lista">
              <span className="step-num">{selectedIndex + 1} / {day.exercises.length}</span>
              <span className="step-label">{selectedExercise ? selectedExercise.name : 'Esercizio'}</span>
            </button>

            {selectedIndex < day.exercises.length - 1 ? (
              <Button
                className="active-footer-nav-btn active-footer-next"
                aria-label="Esercizio successivo"
                onClick={() => goTo(day.exercises[selectedIndex + 1].exerciseId)}
              >
                <span>Succ</span>
                <Icon name="arrow" size={18} />
              </Button>
            ) : (
              <Button
                className="active-footer-nav-btn active-footer-finish"
                onClick={() => showFinish(true)}
              >
                <span>Fine</span>
                <Icon name="check" size={18} />
              </Button>
            )}
          </div>
        </footer>
      )}
      {readonly && (
        <footer className="active-floating-footer readonly-floating-footer">
          <div className="active-footer-content readonly-footer-content">
            <Button
              variant="secondary"
              className="readonly-footer-back-btn"
              onClick={() => navigate('/history')}
            >
              <Icon name="back" size={17} />
              <span>Indietro</span>
            </Button>
            <Button
              variant="secondary"
              className="readonly-footer-delete-btn"
              onClick={() => showDelete(true)}
            >
              <Icon name="trash" size={17} />
              <span>Elimina</span>
            </Button>
          </div>
        </footer>
      )}
      <BottomSheet
        open={orderOpen}
        title="Ordine ed esercizi"
        onClose={() => setOrderOpen(false)}
        footer={
          <div className="order-sheet-30-70-footer">
            <Button variant="secondary" className="order-footer-close-btn" onClick={() => setOrderOpen(false)}>
              Chiudi
            </Button>
            <Button className="order-footer-add-btn" onClick={() => { setOrderOpen(false); setPermanent(false); setPicker({}); }}>
              <Icon name="plus" size={17} /> Aggiungi esercizio
            </Button>
          </div>
        }
      >
        <div className="order-dialog-body">
          <div className="order-list">
            {day.exercises.map((e, i) => (
              <div key={e.exerciseId} className={e.exerciseId === exerciseId ? 'order-current-row' : ''}>
                <button className="order-exercise" onClick={() => { goTo(e.exerciseId); setOrderOpen(false); }}>
                  <span>{i + 1}</span>
                  <div className="order-exercise-info">
                    <strong>{e.name}</strong>
                    <small className="muted">{muscleLabels[e.muscleGroup ?? ''] ?? ''}</small>
                  </div>
                </button>
                <div className="order-actions">
                  <button className="icon-button" disabled={i === 0} aria-label={`Sposta su ${e.name}`} onClick={() => { const exercises = [...day.exercises];[exercises[i - 1], exercises[i]] = [exercises[i], exercises[i - 1]]; changeExercises({ ...day, exercises }); }}>
                    <Icon name="up" size={17} />
                  </button>
                  <button className="icon-button" disabled={i === day.exercises.length - 1} aria-label={`Sposta giù ${e.name}`} onClick={() => { const exercises = [...day.exercises];[exercises[i + 1], exercises[i]] = [exercises[i], exercises[i + 1]]; changeExercises({ ...day, exercises }); }}>
                    <Icon name="down" size={17} />
                  </button>
                  <button className="icon-button danger-text" aria-label={`Rimuovi ${e.name}`} onClick={() => { setOrderOpen(false); setRemoveExercise(e); }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </BottomSheet>
      <BottomSheet open={cancelling} title="Annullare la sessione in corso?" description="Tutti i dati non salvati o parziali di questa sessione verranno eliminati. Questa operazione non può essere annullata." confirmLabel="Elimina sessione" tone="danger" onClose={() => showCancel(false)} onConfirm={async () => { setBusy(true); try { await remove.mutateAsync({ sessionId: session.sessionId }); setTimer(null); writeRestTimer(null); current.current = null; setSession(null); navigate('/'); } finally { setBusy(false); } }} />
      <ExerciseHistory exercise={history} sessions={sessions} onClose={() => showHistory(null)} />
      <ExercisePicker
        open={!!picker}
        exercises={allExercises}
        multi={!picker?.replace}
        onClose={() => setPicker(null)}
        onPick={e => { void pickExercise(e); }}
      />
      <BottomSheet open={!!removeExercise} title="Rimuovere questo esercizio?" description={`${removeExercise?.name ?? ''}: le sue serie verranno rimosse solo da questa seduta. Puoi annullare subito dopo`} tone="danger" confirmLabel="Rimuovi esercizio" onClose={() => setRemoveExercise(null)} onConfirm={() => { changeExercises({ ...day, exercises: day.exercises.filter(e => e.exerciseId !== removeExercise?.exerciseId) }, session.entries.filter(e => e.exerciseId !== removeExercise?.exerciseId)); setExerciseId(day.exercises.find(e => e.exerciseId !== removeExercise?.exerciseId)?.exerciseId ?? ''); }} />
      <BottomSheet open={finish} title="Concludi sessione" description={`${done} serie confermate su ${total}. Solo le serie confermate entrano nello storico`} confirmLabel="Salva e concludi" onClose={() => showFinish(false)} onConfirm={async () => { if (!done) throw new Error('Conferma almeno una serie prima di concludere'); setBusy(true); try { await chain.current; if (saveFailed.current) throw new Error('Attendi il salvataggio delle ultime modifiche'); await complete.mutateAsync({ sessionId: session.sessionId }); setTimer(null); writeRestTimer(null); current.current = null; setSession(null); navigate('/history'); } finally { setBusy(false); } }} />
      <BottomSheet open={deleting} title="Eliminare questa seduta?" description="La cancellazione verrà sincronizzata anche sugli altri dispositivi" confirmLabel="Elimina seduta" tone="danger" onClose={() => showDelete(false)} onConfirm={async () => { await remove.mutateAsync({ sessionId: session.sessionId }); navigate('/history'); }} />
    </div>;
}

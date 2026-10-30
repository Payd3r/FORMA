import { useState } from 'react';
import { useSessioni, useSessioneAttiva } from '../lib/useSessioni';
import { useLibrary, useSaveLibrary, defaultTemplate, legacyTemplate, type WorkoutTemplate, type ExerciseTemplate } from '../lib/useTemplate';
import { catalog, muscleLabels } from '../lib/training';
import Icon from '../components/ui/Icon';
import Button from '../components/ui/Button';
import BottomSheet from '../components/ui/BottomSheet';
import ExercisePicker from '../components/ui/ExercisePicker';
import { useToast } from '../components/ui/Toast';

export default function PlansRoute() {
  const { data: library, isLoading } = useLibrary();
  const save = useSaveLibrary();
  const { data: sessions = [] } = useSessioni();
  const { data: active } = useSessioneAttiva();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<WorkoutTemplate | null>(null);
  const [activating, setActivating] = useState<WorkoutTemplate | null>(null);
  const [viewing, setViewing] = useState<WorkoutTemplate | null>(null);
  const [activeDayId, setActiveDayId] = useState<string>('');
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);

  const [reset, setReset] = useState(false);
  const [picker, setPicker] = useState<{ dayId: string; replace?: string } | null>(null);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);

  if (isLoading || !library) return <div className="loading-state">Apro le tue schede…</div>;

  const exercises = catalog(sessions, [defaultTemplate, ...library.templates, legacyTemplate]);

  function startEditing(plan: WorkoutTemplate) {
    const copy = structuredClone(plan);
    setEditing(copy);
    setActiveDayId(copy.days[0]?.dayId ?? '');
    setOpenSettingsId(null);
    setError('');
  }

  function updateExercise(dayId: string, id: string, patch: Partial<ExerciseTemplate>) {
    if (!editing) return;
    setEditing({
      ...editing,
      days: editing.days.map(d =>
        d.dayId === dayId
          ? { ...d, exercises: d.exercises.map(e => (e.exerciseId === id ? { ...e, ...patch } : e)) }
          : d
      ),
    });
  }

  async function saveEditing() {
    if (!editing) return;
    if (
      !editing.name.trim() ||
      editing.days.some(
        d =>
          !d.label.trim() ||
          !d.exercises.length ||
          d.exercises.some(
            e =>
              !e.name.trim() ||
              e.sets.some(s => !Number.isInteger(s.repsTarget) || s.repsTarget < 1) ||
              (e.increment ?? 0) <= 0
          )
      )
    ) {
      setError('Dai un nome alla scheda e ai giorni, inserisci almeno un esercizio per giorno e target di ripetizioni validi');
      return;
    }
    setError('');
    try {
      const exists = library!.templates.some(t => t.templateId === editing.templateId);
      await save.mutateAsync({
        ...library!,
        templates: exists
          ? library!.templates.map(t => (t.templateId === editing.templateId ? editing : t))
          : [editing, ...library!.templates],
      });
      setEditing(null);
      showToast('Scheda salvata con successo.');
    } catch {
      setError('Salvataggio non riuscito. Riprova');
    }
  }

  const currentDay = editing?.days.find(d => d.dayId === activeDayId) ?? editing?.days[0];

  return (
    <div className={`page-stack ${editing ? 'plans-editing-mode' : ''}`}>
      <div className="page-title">
        <div>
          <h1>{editing ? 'Modifica Scheda' : 'Schede'}</h1>
        </div>
        {!editing && (
          <Button
            onClick={() => {
              const newPlan = {
                schemaVersion: 2,
                templateId: `plan_${crypto.randomUUID()}`,
                name: 'La mia nuova scheda',
                days: [{ dayId: '1', label: 'Giorno 1', exercises: [] }],
              };
              startEditing(newPlan);
            }}
          >
            <Icon name="plus" size={18} />
            Nuova scheda
          </Button>
        )}
      </div>

      {editing ? (
        <>
          {/* Header Editor: Nome scheda */}
          <div className="plan-editor-card">
            <div className="plan-name-input-group">
              <label className="eyebrow" htmlFor="plan-name-field">NOME SCHEDA</label>
              <input
                id="plan-name-field"
                className="plan-name-input-field"
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                placeholder="Es. Ipertrofia 3x Week"
              />
            </div>

            {/* Tabs Giorni */}
            <div className="plan-days-tabs-container">
              <div className="plan-days-tabs">
                {editing.days.map((day, dayIndex) => (
                  <button
                    key={day.dayId}
                    type="button"
                    className={`plan-day-tab ${day.dayId === currentDay?.dayId ? 'active' : ''}`}
                    onClick={() => setActiveDayId(day.dayId)}
                  >
                    <span className="tab-idx">0{dayIndex + 1}</span>
                    <span className="tab-label">{day.label || `Giorno ${dayIndex + 1}`}</span>
                    <span className="tab-count">{day.exercises.length} es</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="plan-day-tab-add"
                  onClick={() => {
                    const newDayId = crypto.randomUUID();
                    setEditing({
                      ...editing,
                      days: [
                        ...editing.days,
                        { dayId: newDayId, label: `Giorno ${editing.days.length + 1}`, exercises: [] },
                      ],
                    });
                    setActiveDayId(newDayId);
                  }}
                >
                  <Icon name="plus" size={15} /> Giorno
                </button>
              </div>
            </div>
          </div>

          {/* Area contenuto Giorno Corrente */}
          {currentDay && (
            <div className="plan-active-day-section">
              <div className="plan-day-meta-bar">
                <div className="plan-day-title-edit">
                  <span className="eyebrow">NOME DEL GIORNO</span>
                  <input
                    className="plan-day-inline-input"
                    value={currentDay.label}
                    onChange={e =>
                      setEditing({
                        ...editing,
                        days: editing.days.map(d =>
                          d.dayId === currentDay.dayId ? { ...d, label: e.target.value } : d
                        ),
                      })
                    }
                  />
                </div>
                {editing.days.length > 1 && (
                  <button
                    className="plan-day-delete-btn"
                    title="Elimina questo giorno"
                    onClick={() => {
                      const nextDays = editing.days.filter(d => d.dayId !== currentDay.dayId);
                      setEditing({ ...editing, days: nextDays });
                      setActiveDayId(nextDays[0]?.dayId ?? '');
                    }}
                  >
                    <Icon name="trash" size={16} />
                    <span>Elimina giorno</span>
                  </button>
                )}
              </div>

              {/* Lista esercizi del giorno */}
              <div className="plan-exercise-list">
                {currentDay.exercises.length === 0 ? (
                  <div className="plan-empty-day">
                    <p>Nessun esercizio presente in questo giorno.</p>
                    <Button variant="secondary" onClick={() => setPicker({ dayId: currentDay.dayId })}>
                      <Icon name="plus" size={16} /> Aggiungi il primo esercizio
                    </Button>
                  </div>
                ) : (
                  currentDay.exercises.map((exercise, index) => {
                    const isSettingsOpen = openSettingsId === exercise.exerciseId;
                    return (
                      <div className="plan-clean-exercise-card" key={exercise.exerciseId}>
                        {/* Header Esercizio */}
                        <div className="plan-card-header">
                          <div className="plan-card-index">0{index + 1}</div>
                          <div className="plan-card-title-box">
                            <span className="plan-card-muscle">{muscleLabels[exercise.muscleGroup ?? ''] ?? 'Generale'}</span>
                            <h3 className="plan-card-title">{exercise.name}</h3>
                          </div>
                          <div className="plan-card-quick-actions">
                            <button
                              className="icon-button"
                              disabled={index === 0}
                              aria-label={`Sposta su ${exercise.name}`}
                              onClick={() => {
                                const items = [...currentDay.exercises];
                                [items[index - 1], items[index]] = [items[index], items[index - 1]];
                                setEditing({
                                  ...editing,
                                  days: editing.days.map(d =>
                                    d.dayId === currentDay.dayId ? { ...d, exercises: items } : d
                                  ),
                                });
                              }}
                            >
                              <Icon name="up" size={16} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={index === currentDay.exercises.length - 1}
                              aria-label={`Sposta giù ${exercise.name}`}
                              onClick={() => {
                                const items = [...currentDay.exercises];
                                [items[index + 1], items[index]] = [items[index], items[index + 1]];
                                setEditing({
                                  ...editing,
                                  days: editing.days.map(d =>
                                    d.dayId === currentDay.dayId ? { ...d, exercises: items } : d
                                  ),
                                });
                              }}
                            >
                              <Icon name="down" size={16} />
                            </button>
                            <button
                              className="icon-button"
                              title="Sostituisci"
                              onClick={() => setPicker({ dayId: currentDay.dayId, replace: exercise.exerciseId })}
                            >
                              <Icon name="edit" size={15} />
                            </button>
                            <button
                              className="icon-button danger-text"
                              aria-label={`Rimuovi ${exercise.name}`}
                              onClick={() =>
                                setEditing({
                                  ...editing,
                                  days: editing.days.map(d =>
                                    d.dayId === currentDay.dayId
                                      ? { ...d, exercises: d.exercises.filter(e => e.exerciseId !== exercise.exerciseId) }
                                      : d
                                  ),
                                })
                              }
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Editor Serie & Ripetizioni */}
                        <div className="plan-sets-compact-row">
                          <span className="eyebrow sets-title">SERIE & REPS</span>
                          <div className="plan-sets-pill-group">
                            {exercise.sets.map((set, sIdx) => (
                              <div key={sIdx} className="plan-set-pill">
                                <span className="pill-s-idx">{sIdx + 1}ª</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max="99"
                                  className="pill-s-input"
                                  value={set.repsTarget || ''}
                                  onChange={e =>
                                    updateExercise(currentDay.dayId, exercise.exerciseId, {
                                      sets: exercise.sets.map((s, j) =>
                                        j === sIdx ? { ...s, repsTarget: Number(e.target.value) } : s
                                      ),
                                    })
                                  }
                                />
                                <span className="pill-s-unit">reps</span>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="plan-add-set-pill-btn"
                              title="Aggiungi serie"
                              onClick={() =>
                                updateExercise(currentDay.dayId, exercise.exerciseId, {
                                  sets: [
                                    ...exercise.sets,
                                    {
                                      setIndex: exercise.sets.length + 1,
                                      repsTarget: exercise.sets.at(-1)?.repsTarget ?? 10,
                                    },
                                  ],
                                })
                              }
                            >
                              <Icon name="plus" size={14} /> Serie
                            </button>
                            {exercise.sets.length > 1 && (
                              <button
                                type="button"
                                className="plan-remove-set-pill-btn"
                                title="Rimuovi ultima serie"
                                onClick={() =>
                                  updateExercise(currentDay.dayId, exercise.exerciseId, {
                                    sets: exercise.sets.slice(0, -1),
                                  })
                                }
                              >
                                <Icon name="close" size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Pulsante impostazioni avanzate opzionali */}
                        <div className="plan-card-footer">
                          <button
                            type="button"
                            className="plan-toggle-advanced-btn"
                            onClick={() => setOpenSettingsId(isSettingsOpen ? null : exercise.exerciseId)}
                          >
                            <Icon name="settings" size={13} />
                            <span>{isSettingsOpen ? 'Nascondi impostazioni avanzate' : 'Impostazioni avanzate (kg, tipo carico)'}</span>
                          </button>
                        </div>

                        {/* Pannello impostazioni avanzate (apribile solo su richiesta) */}
                        {isSettingsOpen && (
                          <div className="plan-advanced-panel">
                            <div className="plan-fields">
                              <label className="field">
                                <span>GRUPPO MUSCOLARE</span>
                                <select
                                  className="input"
                                  value={exercise.muscleGroup ?? 'Back'}
                                  onChange={e =>
                                    updateExercise(currentDay.dayId, exercise.exerciseId, {
                                      muscleGroup: e.target.value,
                                    })
                                  }
                                >
                                  {Object.entries(muscleLabels).map(([key, name]) => (
                                    <option key={key} value={key}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="field">
                                <span>INCREMENTO (KG)</span>
                                <input
                                  className="input"
                                  type="number"
                                  step="0.25"
                                  min="0.25"
                                  value={exercise.increment ?? 2.5}
                                  onChange={e =>
                                    updateExercise(currentDay.dayId, exercise.exerciseId, {
                                      increment: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>

                              <label className="field">
                                <span>TIPO DI CARICO</span>
                                <select
                                  className="input"
                                  value={exercise.loadMode ?? 'total'}
                                  onChange={e =>
                                    updateExercise(currentDay.dayId, exercise.exerciseId, {
                                      loadMode: e.target.value,
                                    })
                                  }
                                >
                                  <option value="total">Totale / Macchina</option>
                                  <option value="each">Per manubrio / Lato</option>
                                  <option value="assisted">Assistito</option>
                                  <option value="bodyweight">Corpo libero</option>
                                </select>
                              </label>
                            </div>
                            {exercise.assumption && <p className="assumption-note">{exercise.assumption}</p>}
                            {exercise.incrementNote && <p className="tiny muted">{exercise.incrementNote}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                <button
                  type="button"
                  className="plan-add-exercise-full-btn"
                  onClick={() => setPicker({ dayId: currentDay.dayId })}
                >
                  <Icon name="plus" size={17} /> Aggiungi esercizio a {currentDay.label}
                </button>
              </div>
            </div>
          )}

          {error && <p role="alert" className="error-message">{error}</p>}

          {/* Floating Actions Bar in Basso */}
          <div className="plan-editor-floating-bar">
            <div className="plan-editor-bar-inner">
              <Button variant="secondary" onClick={() => setDiscard(true)}>
                Annulla
              </Button>
              <Button onClick={saveEditing} loading={save.isPending} className="plan-save-btn">
                Salva scheda <Icon name="check" size={17} />
              </Button>
            </div>
          </div>

          <ExercisePicker
            open={!!picker}
            exercises={exercises}
            multi={!picker?.replace}
            onClose={() => setPicker(null)}
            onPick={picked => {
              if (!picker) return;
              const pickedArray = Array.isArray(picked) ? picked : [picked];
              if (pickedArray.length === 0) return;

              const day = editing.days.find(d => d.dayId === picker.dayId)!;

              if (picker.replace && pickedArray.length === 1) {
                const exercise = pickedArray[0];
                if (
                  day.exercises.some(
                    e => e.exerciseId === exercise.exerciseId && e.exerciseId !== picker.replace
                  )
                ) {
                  setError('Esercizio già presente in questo giorno');
                  return;
                }
                setEditing({
                  ...editing,
                  days: editing.days.map(d =>
                    d.dayId === picker.dayId
                      ? {
                          ...d,
                          exercises: d.exercises.map(e =>
                            e.exerciseId === picker.replace ? exercise : e
                          ),
                        }
                      : d
                  ),
                });
                return;
              }

              // Multi-select / add
              const validToAdd = pickedArray.filter(
                exercise => !day.exercises.some(e => e.exerciseId === exercise.exerciseId)
              );
              if (validToAdd.length === 0) {
                setError('Tutti gli esercizi selezionati sono già presenti in questo giorno');
                return;
              }

              setEditing({
                ...editing,
                days: editing.days.map(d =>
                  d.dayId === picker.dayId
                    ? {
                        ...d,
                        exercises: [...d.exercises, ...validToAdd],
                      }
                    : d
                ),
              });
            }}
          />
        </>
      ) : (
        <div className="plan-grid">
          {library.templates.map(plan => (
            <section
              className={`plan-card ${plan.templateId === library.activeId ? 'selected' : ''}`}
              key={plan.templateId}
            >
              <div className="section-heading">
                <span className={`pill ${plan.templateId === library.activeId ? 'accent' : ''}`}>
                  {plan.templateId === library.activeId
                    ? 'IN USO'
                    : plan.templateId === legacyTemplate.templateId
                    ? 'SCHEDA PRECEDENTE'
                    : 'NELLA TUA LIBRERIA'}
                </span>
                <Icon name="book" />
              </div>
              <h2>{plan.name}</h2>
              <p className="muted">
                {plan.days.length} giorni · {plan.days.reduce((sum, d) => sum + d.exercises.length, 0)} esercizi
              </p>
              <div className="plan-days">
                {plan.days.map((d, i) => (
                  <div key={d.dayId}>
                    <span>0{i + 1}</span>
                    <strong>{d.label}</strong>
                    <small>{d.exercises.length} esercizi</small>
                  </div>
                ))}
              </div>
              <div className="plan-buttons">
                <Button className="plan-view-button" onClick={() => setViewing(plan)}>
                  Visualizza
                </Button>
                <Button
                  className="plan-icon-button"
                  aria-label="Modifica"
                  title="Modifica"
                  variant="secondary"
                  onClick={() => startEditing(plan)}
                >
                  <Icon name="edit" size={18} />
                </Button>
                <Button
                  className="plan-icon-button"
                  aria-label="Duplica"
                  title="Duplica"
                  variant="secondary"
                  onClick={() => {
                    const copy = structuredClone(plan);
                    copy.templateId = `plan_${crypto.randomUUID()}`;
                    copy.name = `${plan.name} · copia`;
                    startEditing(copy);
                  }}
                >
                  <Icon name="copy" size={18} />
                </Button>
                {plan.templateId !== library.activeId && (
                  <Button
                    onClick={() => {
                      setActivating(plan);
                      setReset(false);
                    }}
                  >
                    Usa scheda <Icon name="arrow" size={16} />
                  </Button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Visualizzatore Modale Scheda */}
      <BottomSheet open={!!viewing} title={viewing?.name} cancelLabel="Chiudi" onClose={() => setViewing(null)}>
        <div className="plan-view">
          {viewing?.days.map((day, i) => (
            <section key={day.dayId}>
              <h3>
                <span className="day-number">0{i + 1}</span>
                {day.label}
              </h3>
              {day.exercises.map(exercise => (
                <div className="plan-view-exercise" key={exercise.exerciseId}>
                  <strong>{exercise.name}</strong>
                  <span>{exercise.sets.length} serie</span>
                  <small>{exercise.sets.map(s => s.repsTarget).join(' / ')} reps</small>
                  {exercise.incrementNote && <p>{exercise.incrementNote}</p>}
                </div>
              ))}
            </section>
          ))}
        </div>
      </BottomSheet>

      {/* Attivazione Scheda */}
      <BottomSheet
        open={!!activating}
        title="Un nuovo capitolo"
        description={`Vuoi usare “${activating?.name}”? Lo storico delle sedute rimane intatto.${
          active ? ' La seduta già in corso continua con la propria scheda' : ''
        }`}
        confirmLabel="Attiva scheda"
        onClose={() => setActivating(null)}
        onConfirm={async () => {
          if (!activating) return;
          const updated = { ...activating, baselineAfter: reset ? new Date().toISOString() : undefined };
          await save.mutateAsync({
            ...library,
            activeId: updated.templateId,
            templates: library.templates.map(t => (t.templateId === updated.templateId ? updated : t)),
          });
          showToast('Nuova scheda attiva. Lo storico è sempre nel diario');
        }}
      >
        <div className="radio-options">
          <label>
            <input type="radio" checked={!reset} onChange={() => setReset(false)} />
            <span>
              <strong>Mantieni la continuità</strong>
              <small>Riproponi gli ultimi carichi degli stessi esercizi. Le varianti nuove partono vuote</small>
            </span>
          </label>
          <label>
            <input type="radio" checked={reset} onChange={() => setReset(true)} />
            <span>
              <strong>Riparti con carichi vuoti</strong>
              <small>Nuovo punto di partenza per questa scheda. Nessuna seduta viene cancellata</small>
            </span>
          </label>
        </div>
      </BottomSheet>

      <BottomSheet
        open={discard}
        title="Lasciare le modifiche?"
        description="Le modifiche non salvate all’editor andranno perse"
        confirmLabel="Lascia editor"
        onClose={() => setDiscard(false)}
        onConfirm={() => {
          setEditing(null);
          setError('');
        }}
      />
    </div>
  );
}

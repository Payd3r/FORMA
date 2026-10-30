import { useState, useEffect, type ReactNode } from 'react';
import type { ExerciseTemplate } from '../../lib/useTemplate';
import { muscleLabels } from '../../lib/training';
import BottomSheet from './BottomSheet';
import Icon from './Icon';
import ExerciseArt from './ExerciseArt';
import Button from './Button';

export default function ExercisePicker({
  open,
  exercises,
  onClose,
  onPick,
  multi = false,
  children,
}: {
  open: boolean;
  exercises: ExerciseTemplate[];
  onClose: () => void;
  onPick: (exercise: ExerciseTemplate | ExerciseTemplate[]) => void;
  multi?: boolean;
  children?: ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Resetta quanto scritto e selezionato ad ogni apertura o chiusura
  useEffect(() => {
    if (!open) {
      setSearch('');
      setGroup('all');
      setSelectedIds([]);
    }
  }, [open]);

  function handleClose() {
    setSearch('');
    setGroup('all');
    setSelectedIds([]);
    onClose();
  }

  function toggleSelect(exercise: ExerciseTemplate) {
    if (!multi) {
      onPick(structuredClone(exercise));
      handleClose();
      return;
    }
    setSelectedIds(prev =>
      prev.includes(exercise.exerciseId)
        ? prev.filter(id => id !== exercise.exerciseId)
        : [...prev, exercise.exerciseId]
    );
  }

  function handleConfirmMulti() {
    const selected = exercises.filter(e => selectedIds.includes(e.exerciseId));
    if (selected.length > 0) {
      onPick(structuredClone(selected));
    }
    handleClose();
  }

  const filtered = exercises
    .filter(e => group === 'all' || e.muscleGroup === group)
    .filter(e => e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  return (
    <BottomSheet
      open={open}
      cancelLabel="Annulla"
      onClose={handleClose}
      footer={
        <div className="picker-sheet-footer-30-70">
          <Button
            variant="secondary"
            className="picker-footer-cancel-btn"
            onClick={handleClose}
          >
            Annulla
          </Button>
          <Button
            className="picker-footer-confirm-btn"
            disabled={selectedIds.length === 0}
            onClick={handleConfirmMulti}
          >
            Conferma {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
          </Button>
        </div>
      }
    >
      {/* Header pulito: solo barra di ricerca ed eventualmente filtro compatto */}
      <div className="picker-header-search-wrap">
        <label className="search-field">
          <Icon name="search" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca un esercizio…"
            aria-label="Cerca esercizio"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearch('')}
              aria-label="Pulisci ricerca"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
        <div className="picker-muscle-tabs-scroll">
          <div className="picker-muscle-tabs">
            <button
              type="button"
              className={`picker-muscle-pill ${group === 'all' ? 'active' : ''}`}
              onClick={() => setGroup('all')}
            >
              Tutti
            </button>
            {Object.entries(muscleLabels).map(([id, name]) => (
              <button
                key={id}
                type="button"
                className={`picker-muscle-pill ${group === id ? 'active' : ''}`}
                onClick={() => setGroup(id)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {children}

      <div className="picker-list">
        {filtered.map(exercise => {
          const isSelected = selectedIds.includes(exercise.exerciseId);
          return (
            <button
              key={exercise.exerciseId}
              type="button"
              className={`picker-item ${isSelected ? 'picker-item-selected' : ''}`}
              onClick={() => toggleSelect(exercise)}
            >
              <div className="picker-art">
                <ExerciseArt exercise={exercise} compact />
              </div>
              <div className="picker-info">
                <strong>{exercise.name}</strong>
                <small>
                  {muscleLabels[exercise.muscleGroup ?? ''] ?? 'Esercizio'} · {exercise.sets.length} serie
                </small>
              </div>
              <div className={`picker-checkbox ${isSelected ? 'checked' : ''}`}>
                {isSelected ? <Icon name="check" size={16} /> : <Icon name="plus" size={16} />}
              </div>
            </button>
          );
        })}
      </div>

      {search.trim() && (
        <button
          type="button"
          className="btn btn-secondary w-full mt-3"
          onClick={() => {
            const custom: ExerciseTemplate = {
              exerciseId: `custom_${crypto.randomUUID()}`,
              name: search.trim(),
              muscleGroup: 'Back',
              increment: 2.5,
              sets: [1, 2, 3].map(i => ({ setIndex: i, repsTarget: 10 })),
            };
            if (!multi) {
              onPick(custom);
              handleClose();
            } else {
              setSelectedIds(prev => [...prev, custom.exerciseId]);
              exercises.push(custom);
            }
          }}
        >
          Crea “{search.trim()}” <Icon name="plus" />
        </button>
      )}
    </BottomSheet>
  );
}

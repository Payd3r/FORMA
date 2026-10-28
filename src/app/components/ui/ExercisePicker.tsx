import { useState, type ReactNode } from 'react';
import type { ExerciseTemplate } from '../../lib/useTemplate';
import { muscleLabels } from '../../lib/training';
import BottomSheet from './BottomSheet';
import Icon from './Icon';
import ExerciseArt from './ExerciseArt';
export default function ExercisePicker({ open, exercises, onClose, onPick, children }: { children?: ReactNode; open: boolean; exercises: ExerciseTemplate[]; onClose: () => void; onPick: (exercise: ExerciseTemplate) => void }) {
  const [search, setSearch] = useState(''); const [group, setGroup] = useState('all');
  return <BottomSheet open={open} title="Esercizi" cancelLabel="Chiudi" onClose={onClose}>
    {children}<label className="search-field"><Icon name="search" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca un esercizio…" aria-label="Cerca esercizio" /></label>
    <select className="input mt-3" aria-label="Gruppo muscolare" value={group} onChange={e => setGroup(e.target.value)}><option value="all">Tutti i gruppi</option>{Object.entries(muscleLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
    <div className="picker-list">{exercises.filter(e => (group === 'all' || e.muscleGroup === group)).filter(e => e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(exercise => <button key={exercise.exerciseId} className="picker-item" onClick={() => { onPick(structuredClone(exercise)); onClose(); }}><div className="picker-art"><ExerciseArt exercise={exercise} compact /></div><div><strong>{exercise.name}</strong><small>{muscleLabels[exercise.muscleGroup ?? ''] ?? 'Esercizio'} · {exercise.sets.length} serie</small></div><Icon name="plus" size={18} /></button>)}</div>
    {search.trim() && <button className="btn btn-secondary w-full mt-3" onClick={() => { onPick({ exerciseId: `custom_${crypto.randomUUID()}`, name: search.trim(), muscleGroup: 'Back', increment: 2.5, sets: [1, 2, 3].map(i => ({ setIndex: i, repsTarget: 10 })) }); onClose(); }}>Crea “{search.trim()}” <Icon name="plus" /></button>}
  </BottomSheet>;
}

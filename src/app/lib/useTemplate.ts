import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import defaults from '../data/default.template.json';
import legacy from '../data/legacy.template.json';
import { readSetting, writeSetting, type Sessione } from './idb';
export type SetTarget = { setIndex: number; repsTarget: number; rpeTarget?: number; restNote?: string };
export type ExerciseTemplate = { exerciseId: string; name: string; muscleGroup?: string; sets: SetTarget[]; increment?: number; technique?: string; weightOffsets?: number[]; incrementNote?: string; assumption?: string; relatedExerciseId?: string; loadMode?: string };
export type DayTemplate = { dayId: string; label: string; weekdayHint?: string; exercises: ExerciseTemplate[] };
export type WorkoutTemplate = { schemaVersion: number; templateId: string; name: string; baselineAfter?: string; days: DayTemplate[] };
export type TemplateLibrary = { activeId: string; templates: WorkoutTemplate[] };
export const defaultTemplate: WorkoutTemplate = defaults;
export const legacyTemplate: WorkoutTemplate = legacy;
const initial: TemplateLibrary = { activeId: defaults.templateId, templates: [defaults, legacy] };
export function useLibrary() { return useQuery({ queryKey: ['library'], queryFn: async () => await readSetting<TemplateLibrary>('templates') ?? initial, staleTime: Infinity }); }
export function useSaveLibrary() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (library: TemplateLibrary) => writeSetting('templates', library), onSuccess: (_, library) => { client.setQueryData(['library'], library); } });
}
export function useTemplate() {
  const query = useLibrary(); return { ...query, data: query.data?.templates.find(t => t.templateId === query.data?.activeId) ?? defaultTemplate };
}
export function sessionDay(session: Sessione, templates: WorkoutTemplate[] = []): DayTemplate {
  if (session.daySnapshot) return session.daySnapshot;
  const template = [legacyTemplate, ...templates, defaultTemplate].find(t => t.templateId === session.templateId);
  const day = template?.days.find(d => d.dayId === session.dayId);
  if (day) return day;
  return { dayId: session.dayId, label: `Giorno ${session.dayId}`, exercises: session.entries.map(e => ({ exerciseId: e.exerciseId, name: e.exerciseId.replaceAll('_', ' '), sets: e.performedSets.map(s => ({ setIndex: s.setIndex, repsTarget: s.reps })) })) };
}
export function isValidTemplate(value: unknown): value is WorkoutTemplate {
  const t = value as WorkoutTemplate;
  return !!t && typeof t.templateId === 'string' && typeof t.name === 'string' && Array.isArray(t.days) && t.days.length > 0 && new Set(t.days.map(d => d.dayId)).size === t.days.length && t.days.every(d => typeof d.dayId === 'string' && typeof d.label === 'string' && Array.isArray(d.exercises) && d.exercises.length > 0 && new Set(d.exercises.map(e => e.exerciseId)).size === d.exercises.length && d.exercises.every(e => typeof e.exerciseId === 'string' && typeof e.name === 'string' && Array.isArray(e.sets) && e.sets.length > 0 && e.sets.every(s => Number.isFinite(s.repsTarget) && s.repsTarget > 0)));
}

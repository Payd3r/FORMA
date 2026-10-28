export type StatoSessione = 'in_progress' | 'completed';

export type SetEseguito = {
  setIndex: number;
  weight: number;
  reps: number;
  completed?: boolean;
  completedAt?: string;
  restSeconds?: number;
  kind?: 'normal' | 'drop';
  weightString?: string;
  repsString?: string;
  note?: string;
};

export type VoceAllenamento = {
  exerciseId: string;
  performedSets: SetEseguito[];
};

export type Sessione = {
  schemaVersion: number;
  userId: string;
  sessionId: string;
  date: string;
  templateId: string;
  dayId: string;
  status: StatoSessione;
  entries: VoceAllenamento[];
  exerciseOrder?: string[];
  sessionNotes?: string;
  daySnapshot?: { dayId: string; label: string; exercises: { exerciseId: string; name: string; sets: { setIndex: number; repsTarget: number }[] }[] };
  templateName?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiSessionPayload = Omit<Sessione, 'userId'>;

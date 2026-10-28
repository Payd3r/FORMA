import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Sessione } from './types.js';

const legacyTemplate = JSON.parse(fs.readFileSync(new URL('./legacy.template.json', import.meta.url), 'utf8')) as { templateId: string; name: string; days: NonNullable<Sessione['daySnapshot']>[] };
const defaultTemplate = JSON.parse(fs.readFileSync(new URL('./default.template.json', import.meta.url), 'utf8')) as { templateId: string };
function legacySnapshot(session: Pick<Sessione, 'templateId' | 'dayId' | 'exerciseOrder'>) {
  if (session.templateId !== legacyTemplate.templateId) return undefined;
  const day = legacyTemplate.days.find(d => d.dayId === session.dayId);
  if (!day) return undefined;
  const order = session.exerciseOrder ?? [];
  const exercises = [...order.map(id => day.exercises.find(e => e.exerciseId === id)).filter((e): e is typeof day.exercises[number] => !!e), ...day.exercises.filter(e => !order.includes(e.exerciseId))];
  return { ...day, exercises };
}

export type SessionRow = {
  sessionId: string;
  userId: string;
  date: string;
  templateId: string;
  dayId: string;
  status: string;
  entries: string;
  exerciseOrder: string | null;
  daySnapshot: string | null;
  templateName: string | null;
  sessionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
};

let dbInstance: Database.Database | null = null;

function resolveDbPath() {
  const fallback = path.join(process.cwd(), 'data', 'fitness.db');
  return process.env.DB_PATH ?? fallback;
}

function ensureDbDirectory(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDb() {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    ensureDbDirectory(dbPath);
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sessionId TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        date TEXT NOT NULL,
        templateId TEXT NOT NULL,
        dayId TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed')),
        entries TEXT NOT NULL,
        exerciseOrder TEXT,
        sessionNotes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        schemaVersion INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_userId ON sessions(userId);
      CREATE INDEX IF NOT EXISTS idx_date ON sessions(date);
      CREATE INDEX IF NOT EXISTS idx_status ON sessions(status);
    `);
    const columns = dbInstance.prepare('PRAGMA table_info(sessions)').all() as { name: string }[];
    if (!columns.some(c => c.name === 'daySnapshot')) dbInstance.exec('ALTER TABLE sessions ADD COLUMN daySnapshot TEXT');
    if (!columns.some(c => c.name === 'templateName')) dbInstance.exec('ALTER TABLE sessions ADD COLUMN templateName TEXT');
    dbInstance.exec(`CREATE TABLE IF NOT EXISTS deleted_sessions (sessionId TEXT PRIMARY KEY, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL);`);
    // Metadata-only migration: keep IDs, loads, reps, dates and updatedAt unchanged.
    // Unsent edits on older clients must remain eligible for reconciliation.
    const db = dbInstance;
    db.transaction(() => {
      const rows = db.prepare('SELECT * FROM sessions WHERE templateId = ? AND (daySnapshot IS NULL OR templateName IS NULL)').all(legacyTemplate.templateId) as SessionRow[];
      const update = db.prepare('UPDATE sessions SET daySnapshot = COALESCE(daySnapshot, ?), templateName = COALESCE(templateName, ?) WHERE sessionId = ?');
      for (const row of rows) {
        const snapshot = legacySnapshot({ templateId: row.templateId, dayId: row.dayId, exerciseOrder: row.exerciseOrder ? JSON.parse(row.exerciseOrder) : [] });
        if (snapshot) update.run(JSON.stringify(snapshot), legacyTemplate.name, row.sessionId);
      }
      db.prepare('INSERT OR IGNORE INTO settings (key,value,updatedAt) VALUES (?,?,?)').run('templates', JSON.stringify({ activeId: defaultTemplate.templateId, templates: [defaultTemplate, legacyTemplate] }), new Date().toISOString());
    })();
  }

  return dbInstance;
}

export function serializeSession(session: Sessione) {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    date: session.date,
    templateId: session.templateId,
    dayId: session.dayId,
    status: session.status,
    entries: JSON.stringify(session.entries ?? []),
    daySnapshot: session.daySnapshot || legacySnapshot(session) ? JSON.stringify(session.daySnapshot ?? legacySnapshot(session)) : null,
    templateName: session.templateName ?? (session.templateId === legacyTemplate.templateId ? legacyTemplate.name : null),
    exerciseOrder: session.exerciseOrder ? JSON.stringify(session.exerciseOrder) : null,
    sessionNotes: session.sessionNotes ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    schemaVersion: session.schemaVersion
  } satisfies SessionRow;
}

export function parseSessionRow(row: SessionRow): Sessione {
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    date: row.date,
    templateId: row.templateId,
    dayId: row.dayId,
    status: row.status as Sessione['status'],
    entries: row.entries ? JSON.parse(row.entries) : [],
    daySnapshot: row.daySnapshot ? JSON.parse(row.daySnapshot) : undefined,
    templateName: row.templateName ?? undefined,
    exerciseOrder: row.exerciseOrder ? JSON.parse(row.exerciseOrder) : [],
    sessionNotes: row.sessionNotes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    schemaVersion: row.schemaVersion
  };
}

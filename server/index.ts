import express from 'express';
import cors from 'cors';
import sessionsRouter from './routes/sessions.js';
import serviceRouter from './routes/service.js';
import { authMiddleware } from './middleware/auth.js';
import { getDb } from './db.js';
import path from 'node:path';

const app = express();

// Configura CORS per permettere richieste da qualsiasi origine
app.use(cors({
  origin: '*', // In produzione, specifica gli origin consentiti
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-user-id']
}));
app.use(express.json({ limit: '1mb' }));

// Inizializza il database all'avvio
const db = getDb();
const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'fitness.db');
console.log('Database initialized at:', dbPath);

function getHealthPayload() {
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'fitness.db');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      path: dbPath,
      tables: tables.map((t: any) => t.name),
      sessionCount: sessionCount.count
    }
  };
}

app.get('/health', (_req, res) => {
  try {
    res.json(getHealthPayload());
  } catch (error: any) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Endpoint di test senza autenticazione per verificare la connessione
app.get('/test', (_req, res) => {
  res.json({ 
    message: 'Backend is reachable!',
    timestamp: new Date().toISOString(),
    headers: _req.headers
  });
});

// Stessi endpoint esposti anche sotto /api per il proxy nginx
app.get('/api/health', (_req, res) => {
  try {
    res.json(getHealthPayload());
  } catch (error: any) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/api/test', (_req, res) => {
  res.json({
    message: 'Backend is reachable!',
    timestamp: new Date().toISOString(),
    headers: _req.headers
  });
});

// Endpoint senza auth: restituisce l'unico userId se esiste un solo utente nel DB
app.get('/api/default-user', (_req, res) => {
  try {
    const row = db
      .prepare(
        `SELECT userId
         FROM sessions
         GROUP BY userId
         ORDER BY COUNT(*) DESC, MAX(updatedAt) DESC
         LIMIT 1`
      )
      .get() as { userId?: string } | undefined;

    res.json({ userId: row?.userId ?? null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route service-to-service (autenticata con Bearer token, senza x-user-id)
app.use('/api', serviceRouter);

app.use('/api', authMiddleware);
app.use('/api', sessionsRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`Fitness API listening on port ${port}`);
});

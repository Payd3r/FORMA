import { useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLibrary, isValidTemplate, type TemplateLibrary } from '../lib/useTemplate';
import { apriDB, prendiSessioni, salvaSessione, writeSetting, type Sessione } from '../lib/idb';
import { getSyncState, subscribeSync, reconcileFromServer } from '../lib/sync';
import { checkUpdate, needsUpdate } from '../lib/pwa';
import { waitForSaves } from '../lib/saving';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import BottomSheet from '../components/ui/BottomSheet';
function validSession(s: Sessione): boolean {
  return !!s && typeof s.sessionId === 'string' && typeof s.templateId === 'string' && typeof s.dayId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && ['completed', 'in_progress'].includes(s.status) && Number.isFinite(Date.parse(s.createdAt)) && Number.isFinite(Date.parse(s.updatedAt)) && Array.isArray(s.entries) && s.entries.every(e => typeof e.exerciseId === 'string' && Array.isArray(e.performedSets) && e.performedSets.every(v => Number.isFinite(v.weight) && v.weight >= 0 && Number.isInteger(v.reps) && v.reps >= 0)) && (!s.daySnapshot || isValidTemplate({ schemaVersion: 2, templateId: 'snapshot', name: 'snapshot', days: [s.daySnapshot] }));
}
export default function SettingsRoute() {
 const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<{ sessions: Sessione[]; library?: TemplateLibrary } | null>(null);
  const input = useRef<HTMLInputElement>(null); const { data: library } = useLibrary(); const client = useQueryClient(); const sync = useSyncExternalStore(subscribeSync, getSyncState);
  async function exportBackup() {
    await waitForSaves(); const sessions = await prendiSessioni();
    const content = JSON.stringify({ schemaVersion: 2, exportedAt: new Date().toISOString(), sessions, library }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `forma-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Backup esportato con sedute e schede');
  }
  async function loadBackup(file: File) {
    setError('');
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('File troppo grande: massimo 15 MB');
      const json = JSON.parse(await file.text()); const sessions = json.sessions;
      if (!Array.isArray(sessions) || !sessions.every(validSession) || new Set(sessions.map(s => s.sessionId)).size !== sessions.length) throw new Error('Il file non contiene sedute valide. Nessun dato è stato modificato');
      const importedLibrary = json.library as TemplateLibrary | undefined;
      if (importedLibrary && (!Array.isArray(importedLibrary.templates) || !importedLibrary.templates.every(isValidTemplate) || !importedLibrary.templates.some(t => t.templateId === importedLibrary.activeId))) throw new Error('Le schede nel backup non sono valide');
      setBackup({ sessions, library: importedLibrary });
    } catch (e) { setError(e instanceof SyntaxError ? 'Il file non è un JSON valido' : e instanceof Error ? e.message : 'Impossibile leggere il backup'); }
  }
  return <div className="page-stack settings-page"><div className="page-title"><div><h1>Preferenze</h1></div></div>{message && <div className="notice" role="status"><Icon name="check" />{message}</div>}{error && <p className="error-message" role="alert">{error}</p>}

    <section className="panel"><div className="settings-section-heading"><span className="round-icon"><Icon name="cloud" /></span><div><h2>Al sicuro, anche offline</h2><p className="muted">Le modifiche si salvano prima qui, poi si sincronizzano</p></div></div><div className="settings-row"><div><strong>{sync.status === 'error' ? 'Server non raggiungibile' : sync.status === 'offline' ? 'Sei offline' : sync.status === 'syncing' ? 'Sincronizzazione in corso' : 'Il tuo diario è sul dispositivo'}</strong><small>{sync.pending ? `${sync.pending} modifiche da inviare` : sync.lastSync ? `Ultima sincronizzazione: ${new Date(sync.lastSync).toLocaleTimeString('it-IT')}` : 'La sincronizzazione partirà quando il server è disponibile'}</small></div><Button variant="secondary" loading={sync.status === 'syncing'} onClick={() => void reconcileFromServer()}><Icon name="sync" size={17} />Sincronizza</Button></div><p className="tiny muted">Da due dispositivi, attendi la sincronizzazione prima di modificare la stessa seduta. In caso di modifiche simultanee viene mantenuta la versione più recente</p></section>
    <section className="panel"><div className="settings-section-heading"><span className="round-icon"><Icon name="download" /></span><div><h2>Il diario è tuo</h2><p className="muted">Un backup leggibile, con tutte le sedute e le schede</p></div></div><div className="backup-actions"><Button onClick={() => { setError(''); void exportBackup().catch(() => setError('Esportazione non riuscita. Riprova dopo il salvataggio')); }}><Icon name="download" size={18} />Esporta backup</Button><Button variant="secondary" onClick={() => input.current?.click()}><Icon name="upload" size={18} />Importa backup</Button><input ref={input} hidden type="file" accept="application/json,.json" onChange={e => { const file = e.target.files?.[0]; if (file) void loadBackup(file); e.target.value = ''; }} /></div><p className="tiny muted mt-4">L’importazione aggiunge solo le sedute mancanti e le schede nuove. Le sedute già presenti rimangono intatte</p></section>
    <section className="panel"><div className="settings-row"><div><p className="eyebrow">FORMA / VERSIONE 3</p><h3 className="mt-2">Aggiornamenti</h3><small>Quando c’è una nuova versione, ti avvisiamo qui nell’app</small></div><Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); try { await checkUpdate(); setMessage(needsUpdate() ? 'Aggiornamento disponibile: apri “Novità disponibili” in alto' : 'Controllo completato. Se disponibile, vedrai l’avviso di aggiornamento'); } catch { setError('Non riesco a verificare gli aggiornamenti. Riprova quando sei online'); } finally { setBusy(false); } }}>Cerca aggiornamenti</Button></div></section>
    <BottomSheet open={!!backup} title="Riportiamo qui il tuo diario" description={`${backup?.sessions.length ?? 0} sedute nel file. Aggiungeremo quelle mancanti, senza sovrascrivere o cancellare le sedute già presenti. Le sessioni importate in corso verranno archiviate per non interrompere quella attuale.`} confirmLabel="Importa dati" onClose={() => setBackup(null)} onConfirm={async () => {
      if (!backup) return; const db = await apriDB(); let added = 0;
      for (const session of backup.sessions) if (!await db.get('sessioni', session.sessionId) && !await db.get('deleted', session.sessionId)) { await salvaSessione({ ...session, entries: session.entries.map(e => ({ ...e, performedSets: e.performedSets.map(s => ({ ...s, completed: s.completed ?? session.status === 'completed' })) })), status: session.status === 'in_progress' ? 'completed' : session.status }); added++; }
      if (backup.library && library) { const templates = [...library.templates, ...backup.library.templates.filter(t => !library.templates.some(old => old.templateId === t.templateId))]; await writeSetting('templates', { ...library, templates }); }
      client.invalidateQueries(); setMessage(`${added} sedute importate. Il diario è aggiornato.`);
    }} />
  </div>;
}

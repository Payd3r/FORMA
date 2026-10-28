import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from '../ui/Icon';
import BottomSheet from '../ui/BottomSheet';
import { useBackgroundSync } from '../../lib/useBackgroundSync';
import { getSyncState, subscribeSync, reconcileFromServer } from '../../lib/sync';
import { waitForSaves } from '../../lib/saving';
import { needsUpdate, subscribeUpdate, applyUpdate } from '../../lib/pwa';
import { useSessioneAttiva } from '../../lib/useSessioni';
export const navigation = [
  { to: '/', label: 'Panoramica', icon: 'home' }, { to: '/workout', label: 'Allenamento', icon: 'workout' },
  { to: '/plans', label: 'Schede', icon: 'book' }, { to: '/progress', label: 'Progressi', icon: 'chart' }, { to: '/history', label: 'Diario', icon: 'history' }
];
export default function AppShell({ children }: { children: ReactNode }) {
  useBackgroundSync(); const location = useLocation();
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  const resetScroll = () => window.scrollTo({ top: 0, behavior: 'instant' });
  const sync = useSyncExternalStore(subscribeSync, getSyncState);
  const update = useSyncExternalStore(subscribeUpdate, needsUpdate); const [dismissed, dismiss] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { data: active } = useSessioneAttiva();
  const syncLabel = sync.status === 'syncing' ? 'Sincronizzazione…' : sync.status === 'offline' ? 'Offline · dati al sicuro qui' : sync.status === 'error' ? 'Salvato qui · server non raggiungibile' : sync.pending ? `${sync.pending} modifiche da sincronizzare` : sync.lastSync ? 'Tutto sincronizzato' : 'Salvataggio sul dispositivo';
  return <div className="app-frame">
    <aside className="sidebar"><NavLink to="/" className="brand" aria-label="FORMA, panoramica"><svg className="forma-mark" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 27 11 5h18l-3 7H16l-2 5h10l-3 6H12l-2 4Z" fill="currentColor" /></svg><span>FORMA</span></NavLink>
      <div className="sidebar-caption eyebrow">IL TUO ALLENAMENTO</div><nav className="side-nav">{navigation.map(item => <NavLink key={item.to} to={item.to} onClick={resetScroll} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span>{item.to === '/workout' && active && <span className="live-dot" />}</NavLink>)}</nav>
      <div className="sidebar-bottom"><NavLink to="/settings" className="nav-item"><Icon name="settings" /><span>Preferenze</span></NavLink></div>
    </aside>
    <div className="app-content"><header className="app-header"><NavLink className="mobile-brand" to="/" aria-label="FORMA, panoramica">FORMA</NavLink><span className="header-section">FORMA / TRAINING <span className="header-slash">/</span> {navigation.find(n => n.to !== '/' && location.pathname.startsWith(n.to))?.label ?? (location.pathname === '/settings' ? 'Preferenze' : 'Panoramica')}</span>
      <div className="header-actions">{update && <button className="update-pill" onClick={() => dismiss(false)}>Novità disponibili <Icon name="bolt" size={14} /></button>}<button className={`sync-indicator ${sync.status}`} title={syncLabel} aria-label={syncLabel} onClick={() => void reconcileFromServer()}><span className="status-dot" /></button><NavLink to="/settings" className="mobile-settings icon-button" aria-label="Preferenze"><Icon name="settings" /></NavLink></div>
    </header><main className="page-content" key={location.pathname}>{children}</main><footer className="desktop-footer"><span>IL TUO RITMO. I TUOI PROGRESSI</span><span>FORMA / TRAINING JOURNAL</span></footer></div>
    <nav className="mobile-nav" aria-label="Navigazione principale">{navigation.map(item => <NavLink key={item.to} to={item.to} onClick={resetScroll} end={item.to === '/'} aria-label={item.label === 'Panoramica' ? 'Oggi' : item.label} className={({ isActive }) => isActive ? 'active' : ''}><Icon name={item.icon} size={26} /></NavLink>)}</nav>
    <BottomSheet open={update && !dismissed} title="Aggiornamento disponibile" description="Le serie salvate restano al loro posto" confirmLabel={updating ? 'Aggiornamento…' : 'Aggiorna adesso'} cancelLabel="Più tardi" onClose={() => dismiss(true)} onConfirm={async () => { setUpdating(true); try { await waitForSaves(); await applyUpdate(); } finally { setUpdating(false); } }}><div className="notice"><Icon name="bolt" /><span>{active ? 'Riprendi la sessione dopo l’aggiornamento' : 'Aggiorna senza reinstallare'}</span></div></BottomSheet>
  </div>;
}

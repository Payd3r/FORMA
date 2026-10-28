import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { reconcileFromServer, refreshSyncPending } from './sync';
export function useBackgroundSync() {
  const client = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => { if (document.visibilityState === 'visible') void reconcileFromServer(); };
    const changed = () => { void refreshSyncPending(); clearTimeout(timer); timer = setTimeout(sync, 700); };
    const remote = () => { client.invalidateQueries({ queryKey: ['sessioni'] }); client.invalidateQueries({ queryKey: ['sessione'] }); client.invalidateQueries({ queryKey: ['library'] }); };
    sync(); const interval = setInterval(sync, 30000);
    window.addEventListener('online', sync); document.addEventListener('visibilitychange', sync);
    window.addEventListener('fitness-local-change', changed); window.addEventListener('fitness-remote-change', remote);
    return () => { clearInterval(interval); clearTimeout(timer); window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', sync); window.removeEventListener('fitness-local-change', changed); window.removeEventListener('fitness-remote-change', remote); };
  }, [client]);
}

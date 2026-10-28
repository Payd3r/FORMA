import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { prendiSessioni, prendiSessione, prendiSessioneAttiva, prendiUltimaSessioneCompletata, avviaSessione, aggiornaSessione, completaSessione, eliminaSessione } from './idb';
export function useSessioni() { return useQuery({ queryKey: ['sessioni'], queryFn: prendiSessioni, staleTime: Infinity }); }
export function useSessione(id?: string) { return useQuery({ queryKey: ['sessione', id], queryFn: async () => id ? await prendiSessione(id) ?? null : null, enabled: !!id, staleTime: Infinity }); }
export function useSessioneAttiva() { return useQuery({ queryKey: ['sessione', 'attiva'], queryFn: async () => await prendiSessioneAttiva() ?? null, staleTime: Infinity }); }
export function useUltimaSessioneCompletata(dayId?: string) { return useQuery({ queryKey: ['sessioni', 'ultima', dayId], queryFn: () => dayId ? prendiUltimaSessioneCompletata(dayId) : null, enabled: !!dayId }); }
function useRefresh() { const client = useQueryClient(); return () => { client.invalidateQueries({ queryKey: ['sessioni'] }); client.invalidateQueries({ queryKey: ['sessione'] }); }; }
export function useAvviaSessione() { const refresh = useRefresh(); return useMutation({ mutationFn: (input: Parameters<typeof avviaSessione>[0] & { bloccaPrecedente?: boolean }) => avviaSessione(input, { bloccaPrecedente: input.bloccaPrecedente }), onSuccess: refresh }); }
export function useAggiornaSessione() { const refresh = useRefresh(); return useMutation({ mutationFn: ({ sessionId, patch }: { sessionId: string; patch: Parameters<typeof aggiornaSessione>[1] }) => aggiornaSessione(sessionId, patch), onSuccess: refresh }); }
export function useCompletaSessione() { const refresh = useRefresh(); return useMutation({ mutationFn: ({ sessionId, patch }: { sessionId: string; patch?: Parameters<typeof completaSessione>[1] }) => completaSessione(sessionId, patch), onSuccess: refresh }); }
export function useEliminaSessione() { const refresh = useRefresh(); return useMutation({ mutationFn: ({ sessionId }: { sessionId: string }) => eliminaSessione(sessionId), onSuccess: refresh }); }

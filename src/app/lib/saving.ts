const pending = new Set<Promise<unknown>>();
let lastError: unknown;
export function trackSave<T>(promise: Promise<T>) {
  pending.add(promise);
  promise.then(() => { lastError = undefined; }, error => { lastError = error; }).finally(() => pending.delete(promise));
  return promise;
}
export async function waitForSaves() {
  await Promise.all([...pending]);
  if (lastError) throw new Error('Il salvataggio sul dispositivo non è riuscito. Riprova il salvataggio prima di aggiornare.');
}

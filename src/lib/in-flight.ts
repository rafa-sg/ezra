/** Shares concurrent work only. Settled values/errors are never cached. */
export function inFlight<K, V>(limit = 100) {
  const pending = new Map<K, Promise<V>>();
  return (key: K, task: () => Promise<V>): Promise<V> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const operation = Promise.resolve().then(task);
    if (pending.size >= limit) return operation;
    pending.set(key, operation);
    const clear = () => { if (pending.get(key) === operation) pending.delete(key); };
    void operation.then(clear, clear);
    return operation;
  };
}

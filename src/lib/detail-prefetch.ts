/** One speculative read, scoped to a list snapshot. Consume once; never cache permissions. */
export function detailPrefetch<T>(load: (id: string, signal: AbortSignal) => Promise<T>, now = () => performance.now()) {
  type Read = { id: string; started: number; controller: AbortController; promise: Promise<T> };
  let pending: Read | null = null;
  const clear = () => { pending?.controller.abort(); pending = null; };
  const create = (id: string): Read => {
    const controller = new AbortController();
    return { id, controller, started: now(), promise: Promise.resolve().then(() => load(id, controller.signal)) };
  };
  const valid = (id: string) => pending?.id === id && !pending.controller.signal.aborted && now() - pending.started < 3000;
  return {
    warm(id: string) {
      if (valid(id)) return;
      clear();
      const read = create(id);
      pending = read;
      void read.promise.catch(() => { if (pending === read) pending = null; });
    },
    take(id: string) {
      if (valid(id)) {
        const read = pending!;
        pending = null;
        return read;
      }
      clear();
      return create(id);
    },
    dispose: clear,
  };
}

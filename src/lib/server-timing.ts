/** Request-local timings: fixed metric names only, never IDs, URLs or credentials. */
export function serverTiming(now: () => number = () => performance.now()) {
  const started = now();
  let previous = started;
  const metrics: string[] = [];
  return {
    mark(name: string) {
      const current = now();
      metrics.push(`${name};dur=${Math.max(0, current - previous).toFixed(2)}`);
      previous = current;
    },
    header() {
      return [...metrics, `total;dur=${Math.max(0, now() - started).toFixed(2)}`].join(", ");
    },
  };
}

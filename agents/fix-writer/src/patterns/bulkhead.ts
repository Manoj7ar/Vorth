export function generateBulkheadTemplate(concurrency: number) {
  return `import PQueue from "p-queue";

const bulkhead = new PQueue({ concurrency: ${concurrency} });

export function withBulkhead<T>(task: () => Promise<T>) {
  return bulkhead.add(task);
}`;
}

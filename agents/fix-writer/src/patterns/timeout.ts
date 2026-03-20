export function generateTimeoutTemplate(timeoutMs: number) {
  return `const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), ${timeoutMs});

try {
  return await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}`;
}

export function generateCircuitBreakerWrapper(
  functionName: string,
  options: { timeout: number; errorThresholdPercentage: number; resetTimeout: number },
) {
  return `import CircuitBreaker from "opossum";

const ${functionName}Breaker = new CircuitBreaker(${functionName}, {
  timeout: ${options.timeout},
  errorThresholdPercentage: ${options.errorThresholdPercentage},
  resetTimeout: ${options.resetTimeout},
});

export async function ${functionName}WithCircuitBreaker(...args: Parameters<typeof ${functionName}>) {
  return ${functionName}Breaker.fire(...args);
}`;
}

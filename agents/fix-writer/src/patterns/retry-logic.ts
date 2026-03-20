export function generateRetryLogicTemplate(functionName: string) {
  return `for (let attempt = 0; attempt < 3; attempt += 1) {
  try {
    return await ${functionName}();
  } catch (error) {
    if (attempt === 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 100));
  }
}`;
}

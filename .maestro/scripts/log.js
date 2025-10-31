// Simple logging script for Maestro tests
// Usage: runScript with env.MESSAGE

export default async function(params) {
  const { MESSAGE } = params.env || {};
  console.log(MESSAGE || 'Test step completed');
}

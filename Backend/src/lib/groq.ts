const DEPRECATED_MODELS = new Set([
  'llama3-8b-8192',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
]);

/** Resolve a Groq model name, blocking known-decommissioned models. */
export function resolveGroqModel(purpose: 'chat' | 'grade' = 'chat'): string {
  const envModel = process.env.GROQ_MODEL?.trim();
  if (envModel && !DEPRECATED_MODELS.has(envModel)) return envModel;
  return purpose === 'grade' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
}

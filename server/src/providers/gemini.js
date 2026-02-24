export async function callGemini({ prompt, model }) {
  return {
    provider: 'gemini',
    model: model || 'gemini-pro',
    prompt,
    reply: '(stub) Gemini connector placeholder. Set OAuth/API path and enable in runtime config.'
  };
}

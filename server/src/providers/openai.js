export async function callOpenAI({ prompt, model, maxTokens = 256 }) {
  return {
    provider: 'openai',
    model: model || 'gpt-4o-mini',
    maxTokens,
    prompt,
    reply: '(stub) OpenAI connector placeholder. Configure API key and runtime call integration.'
  };
}

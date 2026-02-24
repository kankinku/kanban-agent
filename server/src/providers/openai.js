import { spawnSync } from 'node:child_process';
import { getSecret } from '../services/secretService.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

function getApiKey() {
  try { const s = getSecret('openai-api-key'); if (s?.value) return s.value; } catch { }
  return process.env.OPENAI_API_KEY || null;
}

export async function callOpenAI({ prompt, model = 'gpt-4o-mini', maxTokens = 1024, temperature = 0.7, systemPrompt = '' }) {
  const apiKey = getApiKey();
  if (!apiKey) return { provider: 'openai', ok: false, error: 'NO_API_KEY', reply: 'OpenAI API 키 미설정' };
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  try {
    const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature })
    });
    if (!res.ok) return { provider: 'openai', model, ok: false, error: `HTTP_${res.status}`, reply: await res.text() };
    const data = await res.json();
    return { provider: 'openai', model, ok: true, reply: data.choices?.[0]?.message?.content || '', usage: data.usage || {} };
  } catch (err) { return { provider: 'openai', model, ok: false, error: 'NETWORK_ERROR', reply: err.message }; }
}

export async function testConnection() {
  const key = getApiKey();
  if (!key) return { connected: false, reason: 'API 키 미설정' };
  try {
    const res = await fetch(`${OPENAI_API_BASE}/models`, { headers: { 'Authorization': `Bearer ${key}` } });
    return { connected: res.ok, reason: res.ok ? 'OK' : `HTTP ${res.status}` };
  } catch (e) { return { connected: false, reason: e.message }; }
}

export function getStatus() {
  return { provider: 'openai', configured: !!getApiKey(), authMethod: getApiKey() ? 'api_key' : 'none' };
}

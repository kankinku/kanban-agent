import { callOpenAI, testConnection as testOpenAI, getStatus as statusOpenAI } from './openai.js';
import {
  callGemini,
  callGeminiOAuth,
  testGeminiApiKey,
  getGeminiStatus,
  getGeminiOAuthStatus,
  testGeminiOAuth,
  startGeminiOAuth
} from './gemini.js';
import { callCodex, testConnection as testCodex, getStatus as statusCodex, startCodexLogin } from './codex.js';
import {
  callGithubCopilot,
  testConnection as testGithubCopilot,
  getStatus as statusGithubCopilot,
  startGhAuthLogin
} from './github-copilot.js';

function overrideProvider(statusFn, providerName) {
  return () => ({ ...statusFn(), provider: providerName });
}

const providers = {
  openai: { call: callOpenAI, test: testOpenAI, status: statusOpenAI },
  gemini: { call: callGemini, test: testGeminiApiKey, status: getGeminiStatus },
  'gemini-oauth': { call: callGeminiOAuth, test: testGeminiOAuth, status: overrideProvider(getGeminiOAuthStatus, 'gemini-oauth') },
  'google-gemini-cli': { call: callGeminiOAuth, test: testGeminiOAuth, status: overrideProvider(getGeminiOAuthStatus, 'google-gemini-cli') },
  // Legacy alias (OpenClaw removed this name; keep for compatibility with existing user config)
  'google-antigravity': { call: callGeminiOAuth, test: testGeminiOAuth, status: overrideProvider(getGeminiOAuthStatus, 'google-antigravity') },
  codex: { call: callCodex, test: testCodex, status: statusCodex },
  'github-copilot': { call: callGithubCopilot, test: testGithubCopilot, status: statusGithubCopilot }
};

const providerAlias = {
  antigravity: 'google-antigravity',
  'gemini-cli': 'google-gemini-cli'
};

function resolveProviderName(name) {
  if (!name) return name;
  return providerAlias[name] || name;
}

export async function callProvider(name, params) {
  const resolved = resolveProviderName(name);
  const p = providers[resolved];
  if (!p) return { ok: false, error: 'UNKNOWN_PROVIDER', provider: resolved };
  return p.call(params);
}

export async function testProvider(name) {
  const resolved = resolveProviderName(name);
  const p = providers[resolved];
  if (!p) return { connected: false, reason: `Unknown: ${resolved}` };
  return p.test();
}

export function getAllProviderStatus() {
  return Object.entries(providers).map(([providerName, p]) => {
    const status = p.status();
    return { ...status, provider: providerName };
  });
}

export async function triggerOAuthLogin(name) {
  const resolved = resolveProviderName(name);
  if (resolved === 'codex') return startCodexLogin();
  if (resolved === 'gemini-oauth' || resolved === 'google-gemini-cli' || resolved === 'google-antigravity') return startGeminiOAuth();
  if (resolved === 'github-copilot') return startGhAuthLogin();
  return { started: false, reason: `${name}는 OAuth 로그인 트리거를 지원하지 않습니다.` };
}

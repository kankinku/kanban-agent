// Provider Hub — 중앙 라우팅 + 상태 집계
import { callOpenAI, testConnection as testOpenAI, getStatus as statusOpenAI } from './openai.js';
import { callGemini, testGeminiApiKey, getGeminiStatus, getGeminiOAuthStatus, testGeminiOAuth, startGeminiOAuth } from './gemini.js';
import { callCodex, testConnection as testCodex, getStatus as statusCodex, startCodexLogin } from './codex.js';
import { callGithubCopilot, testConnection as testGithubCopilot, getStatus as statusGithubCopilot, startGhAuthLogin } from './github-copilot.js';

const providers = {
    openai: { call: callOpenAI, test: testOpenAI, status: statusOpenAI },
    gemini: { call: callGemini, test: testGeminiApiKey, status: getGeminiStatus },
    'gemini-oauth': { call: callGemini, test: testGeminiOAuth, status: getGeminiOAuthStatus },
    codex: { call: callCodex, test: testCodex, status: statusCodex },
    'github-copilot': { call: callGithubCopilot, test: testGithubCopilot, status: statusGithubCopilot },
};

export async function callProvider(name, params) {
    const p = providers[name];
    if (!p) return { ok: false, error: 'UNKNOWN_PROVIDER' };
    return p.call(params);
}

export async function testProvider(name) {
    const p = providers[name];
    if (!p) return { connected: false, reason: `Unknown: ${name}` };
    return p.test();
}

export function getAllProviderStatus() {
    return Object.values(providers).map(p => p.status());
}

export function triggerOAuthLogin(name) {
    if (name === 'codex') return startCodexLogin();
    if (name === 'gemini-oauth') return startGeminiOAuth();
    if (name === 'github-copilot') return startGhAuthLogin();
    return { started: false, reason: `${name}은 OAuth 트리거를 지원하지 않습니다.` };
}

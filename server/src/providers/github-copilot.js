import { spawnSync, spawn } from 'node:child_process';

// GitHub Copilot auth uses `gh` CLI (GitHub CLI)
function findGhBin() {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gh'], { encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim().split('\n')[0].trim() : null;
}

function checkGhAuthStatus() {
    if (!findGhBin()) return { authenticated: false, output: 'gh CLI 미설치' };
    try {
        const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 10000 });
        const output = (result.stdout + result.stderr).trim();
        const authenticated = (result.status === 0) || output.includes('Logged in') || output.includes('oauth_token');
        return { authenticated, output };
    } catch (err) {
        return { authenticated: false, output: err.message };
    }
}

export async function callGithubCopilot({ prompt, model = 'copilot-gpt-4o' }) {
    const bin = findGhBin();
    if (!bin) {
        return {
            provider: 'github-copilot',
            ok: false,
            error: 'GH_NOT_INSTALLED',
            reply: 'GitHub CLI(gh)가 설치되지 않았습니다. https://cli.github.com/ 에서 설치하세요.'
        };
    }
    const auth = checkGhAuthStatus();
    if (!auth.authenticated) {
        return {
            provider: 'github-copilot',
            ok: false,
            error: 'NOT_AUTHENTICATED',
            reply: `GitHub CLI 인증이 필요합니다. 터미널에서 'gh auth login'을 실행하세요.\n상태: ${auth.output}`
        };
    }

    try {
        // Use gh copilot suggest or gh api for Copilot Chat API
        const result = spawnSync('gh', ['copilot', 'suggest', '-t', 'shell', prompt], {
            encoding: 'utf8',
            timeout: 60000
        });
        const output = (result.stdout || '').trim() || (result.stderr || '').trim();
        return {
            provider: 'github-copilot',
            model,
            ok: result.status === 0,
            reply: output || '(empty output)',
            exitCode: result.status
        };
    } catch (err) {
        return { provider: 'github-copilot', model, ok: false, error: 'RUNTIME_ERROR', reply: err.message };
    }
}

// OAuth login flow: spawn `gh auth login` and stream output
export function startGhAuthLogin() {
    const bin = findGhBin();
    if (!bin) return { started: false, reason: 'gh CLI 미설치' };
    try {
        const proc = spawn('gh', ['auth', 'login', '--web'], {
            detached: true, stdio: 'ignore'
        });
        proc.on('error', (e) => console.warn('[gh] spawn 오류 (무시됨):', e.message));
        proc.unref();
        return { started: true, reason: 'gh auth login --web 프로세스 시작됨. 브라우저에서 인증을 완료해 주세요.' };
    } catch (err) {
        return { started: false, reason: err.message };
    }
}

export async function testConnection() {
    const bin = findGhBin();
    if (!bin) return { connected: false, reason: 'GitHub CLI(gh) 미설치' };
    const auth = checkGhAuthStatus();
    return { connected: auth.authenticated, reason: auth.authenticated ? 'GitHub OAuth 인증 완료' : auth.output };
}

export function getStatus() {
    const bin = findGhBin();
    if (!bin) return { provider: 'github-copilot', configured: false, authMethod: 'none' };
    const auth = checkGhAuthStatus();
    return { provider: 'github-copilot', configured: auth.authenticated, authMethod: auth.authenticated ? 'gh_oauth' : 'none' };
}

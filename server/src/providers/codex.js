export async function callCodex({ prompt }) {
  return {
    provider: 'codex',
    prompt,
    reply: '(stub) Codex CLI connector placeholder. Requires local oauth login status via existing tooling.'
  };
}

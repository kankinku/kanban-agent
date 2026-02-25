const state = {
  orchestratorPaused: false
};

export function isOrchestratorPaused() {
  return state.orchestratorPaused;
}

export function setOrchestratorPaused(paused) {
  state.orchestratorPaused = Boolean(paused);
  return { ok: true, orchestratorPaused: state.orchestratorPaused };
}

export function orchestratorStatus() {
  return { orchestratorPaused: state.orchestratorPaused };
}

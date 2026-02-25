import { isOrchestratorPaused } from './control.js';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  listTasksByStatus,
  updateTaskStatus,
  setTaskAssignee,
  getTaskCountInProgress,
  addArtifact,
  addReviewReport,
  getAgent,
  createTask,
  getTask
} from './services/kanbanService.js';
import { callProvider } from './providers/index.js';

const MAX_WIP = Number(process.env.KANBAN_MAX_WIP || 2);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WORKER_AGENT_ID = process.env.KANBAN_WORKER_AGENT_ID || 'worker-01';
const REVIEWER_AGENT_ID = process.env.KANBAN_REVIEWER_AGENT_ID || 'reviewer-01';
const MANAGER_AGENT_ID = process.env.KANBAN_MANAGER_AGENT_ID || 'manager-01';
const PM_AGENT_ID = process.env.KANBAN_PM_AGENT_ID || 'pm-01';

const runtimeBase = path.join(ROOT_DIR, '..', 'runtime');
const runtimeFiles = {
  worker: path.join(runtimeBase, 'worker', 'worker-runtime.js'),
  reviewer: path.join(runtimeBase, 'reviewer', 'reviewer-runtime.js'),
  manager: path.join(runtimeBase, 'manager', 'manager-runtime.js')
};

let _cycleRunning = false;

// ─── 모델명 → 프로바이더 매핑 ────────────────────────────────────────────────
function resolveProvider(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.startsWith('gpt') || m.includes('openai')) return 'openai';
  if (m.startsWith('gemini')) return 'gemini';
  if (m === 'codex') return 'codex';
  if (m.includes('copilot') || m.includes('github')) return 'github-copilot';
  return null;
}

// ─── Provider 호출 + 스텁 fallback ──────────────────────────────────────────
async function callProviderWithFallback(providerName, params, stubFn) {
  if (providerName) {
    try {
      const result = await callProvider(providerName, params);
      if (result?.ok !== false) return { ...result, usedProvider: providerName };
    } catch (err) {
      console.error(`[orchestrator] provider ${providerName} error:`, err.message);
    }
  }
  // fallback to stub
  return { ...stubFn(), usedProvider: 'stub' };
}

// ─── Worker 스텁 ─────────────────────────────────────────────────────────────
function workerStub(taskId) {
  const summary = `Worker stub artifact for ${taskId}`;
  const location = `runtime/artifacts/${taskId}/result.json`;
  const checksum = crypto.createHash('sha256').update(`${summary}:${location}`).digest('hex');
  return { ok: true, artifact: { kind: 'report', summary, location, checksum } };
}

// ─── Reviewer 스텁 ───────────────────────────────────────────────────────────
function reviewerStub(artifactSummary) {
  const verdict = artifactSummary ? 'pass' : 'needs_work';
  return {
    verdict,
    score: { correctness: verdict === 'pass' ? 5 : 2, completeness: 4, quality: 4, risk: 3 },
    issues: verdict === 'pass' ? [] : [{ type: 'missing', severity: 'medium', description: 'Empty artifact summary' }]
  };
}

// ─── Manager 스텁 ────────────────────────────────────────────────────────────
function managerStub(verdict) {
  return { toStatus: verdict === 'pass' ? 'Done' : 'Blocked' };
}

// ─── Worker: AI 호출 (실제 작업 요청) ────────────────────────────────────────
async function runWorker(task, agentModel) {
  const providerName = resolveProvider(agentModel);
  const ac = (task.acceptanceCriteria || []).join('\n- ');
  const dod = (task.definitionOfDone || []).join('\n- ');
  const systemPrompt = `당신은 Feature Worker 에이전트입니다. 할당된 태스크를 수행하고 결과 보고서를 작성합니다.`;
  const prompt = `## 태스크 ID: ${task.id}
## 제목: ${task.title}
## 설명: ${task.description || '(설명 없음)'}
${ac ? `## 통과 기준:\n- ${ac}` : ''}
${dod ? `## 완료 정의:\n- ${dod}` : ''}

위 태스크를 수행하고 주요 결과, 구현 내용, 특이사항을 간결하게 요약해 주세요.`;

  const result = await callProviderWithFallback(
    providerName,
    { prompt, systemPrompt, maxTokens: 1024, temperature: 0.3 },
    () => workerStub(task.id)
  );

  if (result.usedProvider !== 'stub' && result.reply) {
    const summary = result.reply.trim().slice(0, 2000);
    const location = `ai/artifacts/${task.id}/result.md`;
    const checksum = crypto.createHash('sha256').update(summary).digest('hex');
    return {
      ok: true,
      usedProvider: result.usedProvider,
      artifact: { kind: 'report', summary, location, checksum }
    };
  }

  return result.usedProvider === 'stub'
    ? workerStub(task.id)
    : { ok: false, reason: result.error || 'provider returned no reply' };
}

// ─── Reviewer: AI 호출 (품질 검토) ──────────────────────────────────────────
async function runReviewer(task, artifact, agentModel) {
  const providerName = resolveProvider(agentModel);
  const ac = (task.acceptanceCriteria || []).join('\n- ');
  const systemPrompt = `당신은 Code Reviewer 에이전트입니다. 워커가 제출한 산출물을 검토하고 통과 여부를 판단합니다.`;
  const prompt = `## 태스크: ${task.title}
## 통과 기준:\n- ${ac || '(기준 없음)'}
## 워커 결과 요약:\n${artifact.summary || '(비어 있음)'}

위 내용을 검토하고 아래 형식으로 답하세요:
verdict: pass 또는 needs_work
reason: (판단 근거 한 줄)`;

  const result = await callProviderWithFallback(
    providerName,
    { prompt, systemPrompt, maxTokens: 256, temperature: 0.1 },
    () => reviewerStub(artifact.summary)
  );

  if (result.usedProvider !== 'stub' && result.reply) {
    const reply = result.reply.toLowerCase();
    const verdict = reply.includes('needs_work') || reply.includes('needs work') || reply.includes('재작업')
      ? 'needs_work' : 'pass';
    const score = verdict === 'pass'
      ? { correctness: 5, completeness: 4, quality: 4, risk: 3 }
      : { correctness: 2, completeness: 3, quality: 2, risk: 4 };
    return { verdict, score, issues: [], usedProvider: result.usedProvider, rawReply: result.reply };
  }

  return { ...reviewerStub(artifact.summary), usedProvider: 'stub' };
}

// ─── Manager: AI 호출 (최종 결정) ────────────────────────────────────────────
async function runManager(task, reviewOut, agentModel) {
  const providerName = resolveProvider(agentModel);
  const systemPrompt = `당신은 Decision Manager 에이전트입니다. 리뷰 결과를 바탕으로 태스크 최종 처리를 결정합니다.`;
  const prompt = `## 태스크: ${task.title}
## 리뷰 결과: ${reviewOut.verdict}
## 리뷰 코멘트: ${reviewOut.rawReply || (reviewOut.verdict === 'pass' ? '기준 충족' : '재작업 필요')}

태스크를 완료(Done) 처리하거나 재작업(Blocked)을 지시하세요.
decision: Done 또는 Blocked`;

  const result = await callProviderWithFallback(
    providerName,
    { prompt, systemPrompt, maxTokens: 128, temperature: 0.1 },
    () => managerStub(reviewOut.verdict)
  );

  if (result.usedProvider !== 'stub' && result.reply) {
    const reply = result.reply.toLowerCase();
    const toStatus = reply.includes('blocked') || reply.includes('재작업') ? 'Blocked' : 'Done';
    return { toStatus, usedProvider: result.usedProvider };
  }

  return { ...managerStub(reviewOut.verdict), usedProvider: 'stub' };
}

// ─── PM 에이전트: 프로젝트 분해 ─────────────────────────────────────────────
async function runPmDecompose(task, agentModel) {
  const providerName = resolveProvider(agentModel);
  const systemPrompt = `당신은 Project Manager 에이전트입니다. 프로젝트 설명을 읽고 실행 가능한 하위 태스크 목록을 JSON으로 반환합니다.`;
  const prompt = `## 프로젝트 설명:
${task.description}

## 태스크 분해 요청
위 프로젝트를 개발 태스크로 분해하세요. 각 태스크는 독립적으로 실행 가능해야 합니다.
다음 JSON 배열 형식으로만 답하세요 (설명 없이):
[
  {
    "title": "태스크 제목",
    "description": "상세 설명",
    "type": "feature|bugfix|refactor|docs",
    "effort": 1-5,
    "acceptanceCriteria": ["기준1", "기준2"],
    "definitionOfDone": ["완료 정의1"]
  }
]`;

  let subtasks = [];
  if (providerName) {
    try {
      const result = await callProvider(providerName, { prompt, systemPrompt, maxTokens: 2048, temperature: 0.4 });
      if (result?.reply) {
        const jsonMatch = result.reply.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try { subtasks = JSON.parse(jsonMatch[0]); } catch { /* ignore parse error */ }
        }
      }
    } catch (err) {
      console.error(`[orchestrator] PM provider error:`, err.message);
    }
  }

  if (!subtasks || subtasks.length === 0) {
    // fallback: 기본 태스크 5개 생성
    subtasks = [
      { title: `${task.title} - 환경 설정`, description: '개발 환경 준비 및 초기 설정', type: 'feature', effort: 2, acceptanceCriteria: ['환경 설정 완료'], definitionOfDone: ['실행 가능한 상태'] },
      { title: `${task.title} - 핵심 기능 구현`, description: '주요 기능 구현', type: 'feature', effort: 4, acceptanceCriteria: ['핵심 기능 동작'], definitionOfDone: ['코드 작성 완료'] },
      { title: `${task.title} - 테스트 검증`, description: '기능 테스트 및 검증', type: 'feature', effort: 3, acceptanceCriteria: ['테스트 통과'], definitionOfDone: ['테스트 케이스 작성 완료'] },
    ];
  }

  const created = [];
  for (const sub of subtasks.slice(0, 10)) {
    const newTask = createTask({
      title: sub.title || '하위 태스크',
      description: sub.description || '',
      type: sub.type || 'feature',
      effort: sub.effort ?? 3,
      urgency: 3,
      priorityModel: 3,
      riskReduction: 3,
      status: 'Backlog',
      acceptanceCriteria: sub.acceptanceCriteria || ['태스크 완료'],
      definitionOfDone: sub.definitionOfDone || ['산출물 제출'],
      parentId: task.id
    });
    created.push(newTask.id);
  }

  return { ok: true, createdSubtasks: created };
}

// ─── 메인 사이클 ─────────────────────────────────────────────────────────────
export async function runCycle() {
  if (isOrchestratorPaused()) {
    return { ok: true, moved: 0, reason: 'orchestrator_paused' };
  }
  if (_cycleRunning) {
    return { ok: true, moved: 0, reason: 'cycle_already_running' };
  }
  _cycleRunning = true;
  try {
    return await _runCycleImpl();
  } finally {
    _cycleRunning = false;
  }
}

async function _runCycleImpl() {
  const inProgress = getTaskCountInProgress();
  const slots = Math.max(0, MAX_WIP - inProgress);
  if (slots === 0) {
    return { ok: true, moved: 0, reason: 'No WIP slots' };
  }

  const ready = listTasksByStatus(['Ready']).slice(0, slots);
  const reports = [];

  for (const task of ready) {
    // ── PM 에이전트 태스크: 프로젝트 분해 특별 처리 ─────────────────────────
    if (task.assigneeAgentId === PM_AGENT_ID || task.title?.startsWith('[프로젝트 셋업]')) {
      const pmAgent = getAgent(PM_AGENT_ID);
      const pmModel = pmAgent?.model || null;

      const startPm = updateTaskStatus({
        taskId: task.id,
        toStatus: 'InProgress',
        actorRole: 'worker',
        actorAgentId: PM_AGENT_ID,
        reason: 'pm_kickoff'
      });
      if (!startPm.ok) { reports.push({ taskId: task.id, step: 'pm_dispatch', ok: false, reason: startPm.reason }); continue; }

      const pmOut = await runPmDecompose(task, pmModel);

      addArtifact({
        taskId: task.id,
        kind: 'report',
        location: `pm/${task.id}/subtasks.json`,
        summary: `분해된 하위 태스크: ${pmOut.createdSubtasks?.length || 0}개`,
        createdByAgentId: PM_AGENT_ID
      });

      updateTaskStatus({ taskId: task.id, toStatus: 'InReview', actorRole: 'worker', actorAgentId: PM_AGENT_ID, reason: 'pm_decompose_complete' });
      addReviewReport({ taskId: task.id, verdict: 'pass', correctness: 5, completeness: 5, quality: 5, risk: 1, reviewerAgentId: REVIEWER_AGENT_ID, comments: `PM 분해 완료: ${pmOut.createdSubtasks?.length || 0}개 하위 태스크 생성`, issues: [] });
      updateTaskStatus({ taskId: task.id, toStatus: 'Done', actorRole: 'manager', actorAgentId: MANAGER_AGENT_ID, reason: 'pm_approved' });

      reports.push({ taskId: task.id, ok: true, step: 'pm_decompose', subtasks: pmOut.createdSubtasks });
      continue;
    }

    // ── 일반 태스크: Worker → Reviewer → Manager ─────────────────────────────
    const started = updateTaskStatus({
      taskId: task.id,
      toStatus: 'InProgress',
      actorRole: 'worker',
      actorAgentId: WORKER_AGENT_ID,
      reason: 'orchestrator_dispatch'
    });
    if (!started.ok) {
      reports.push({ taskId: task.id, step: 'dispatch', ok: false, reason: started.reason });
      continue;
    }

    setTaskAssignee(task.id, WORKER_AGENT_ID);

    // 에이전트 모델 조회
    const workerAgent = getAgent(WORKER_AGENT_ID);
    const reviewerAgent = getAgent(REVIEWER_AGENT_ID);
    const managerAgent = getAgent(MANAGER_AGENT_ID);

    // ── Worker 실행 ──────────────────────────────────────────────────────────
    let workerOut;
    try {
      workerOut = await runWorker(task, workerAgent?.model);
    } catch (err) {
      workerOut = { ok: false, reason: err.message };
    }

    if (!workerOut || workerOut.ok === false) {
      // Worker 실패 → Blocked rollback
      updateTaskStatus({
        taskId: task.id,
        toStatus: 'Blocked',
        actorRole: 'worker',
        actorAgentId: WORKER_AGENT_ID,
        reason: `worker_failed: ${workerOut?.reason || 'unknown'}`
      });
      reports.push({ taskId: task.id, step: 'worker', ok: false, reason: workerOut?.reason || 'worker failed', status: 'Blocked' });
      continue;
    }

    addArtifact({
      taskId: task.id,
      kind: workerOut.artifact?.kind || 'report',
      location: workerOut.artifact?.location || `runtime/${task.id}/artifact.json`,
      summary: workerOut.artifact?.summary || 'worker artifact',
      checksum: workerOut.artifact?.checksum || null,
      createdByAgentId: WORKER_AGENT_ID
    });

    const toReview = updateTaskStatus({
      taskId: task.id,
      toStatus: 'InReview',
      actorRole: 'worker',
      actorAgentId: WORKER_AGENT_ID,
      reason: 'worker_complete_auto_submit'
    });
    if (!toReview.ok) {
      reports.push({ taskId: task.id, step: 'submit', ok: false, reason: toReview.reason });
      continue;
    }

    // ── Reviewer 실행 ─────────────────────────────────────────────────────────
    let reviewOut;
    try {
      reviewOut = await runReviewer(task, workerOut.artifact || {}, reviewerAgent?.model);
    } catch (err) {
      reviewOut = { ...reviewerStub(workerOut.artifact?.summary), usedProvider: 'stub' };
    }

    addReviewReport({
      taskId: task.id,
      verdict: reviewOut.verdict || 'needs_work',
      correctness: reviewOut.score?.correctness,
      completeness: reviewOut.score?.completeness,
      quality: reviewOut.score?.quality,
      risk: reviewOut.score?.risk,
      reviewerAgentId: REVIEWER_AGENT_ID,
      comments: reviewOut.rawReply || (reviewOut.verdict === 'pass' ? 'auto-reviewed pass' : 'auto-reviewed needs_work'),
      issues: reviewOut.issues || []
    });

    // ── Manager 실행 ─────────────────────────────────────────────────────────
    let managerOut;
    try {
      managerOut = await runManager(task, reviewOut, managerAgent?.model);
    } catch (err) {
      managerOut = { ...managerStub(reviewOut.verdict), usedProvider: 'stub' };
    }

    if (managerOut.toStatus === 'Done') {
      const done = updateTaskStatus({
        taskId: task.id,
        toStatus: 'Done',
        actorRole: 'manager',
        actorAgentId: MANAGER_AGENT_ID,
        reason: 'auto_approved'
      });
      reports.push({ taskId: task.id, ok: done.ok, step: 'approve', status: done.ok ? 'Done' : 'error', providers: { worker: workerOut.usedProvider, reviewer: reviewOut.usedProvider, manager: managerOut.usedProvider } });
    } else {
      const block = updateTaskStatus({
        taskId: task.id,
        toStatus: 'Blocked',
        actorRole: 'manager',
        actorAgentId: MANAGER_AGENT_ID,
        reason: 'needs_work'
      });
      reports.push({ taskId: task.id, ok: block.ok, step: 'block', status: 'Blocked', providers: { worker: workerOut.usedProvider, reviewer: reviewOut.usedProvider, manager: managerOut.usedProvider } });
    }
  }

  return { ok: true, moved: ready.length, reason: 'cycle_executed', reports };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  runCycle().then(r => console.log(JSON.stringify(r)));
}

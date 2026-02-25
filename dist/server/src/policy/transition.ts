import { TaskStatus } from '../models/task.js';

export type AgentRole = 'worker' | 'manager' | 'reviewer' | 'admin';

export const transitions = {
  [TaskStatus.Backlog]: [TaskStatus.Ready],
  [TaskStatus.Ready]: [TaskStatus.InProgress],
  [TaskStatus.InProgress]: [TaskStatus.InReview],
  [TaskStatus.InReview]: [TaskStatus.Done, TaskStatus.Backlog, TaskStatus.Ready],
  [TaskStatus.Blocked]: [TaskStatus.Backlog, TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.InReview, TaskStatus.Done, TaskStatus.Archived],
  [TaskStatus.Done]: [TaskStatus.Archived],
  [TaskStatus.Archived]: []
};

export function canTransition(from: TaskStatus, to: TaskStatus, role: AgentRole): boolean {
  const allowed = transitions[from] || [];
  if (!allowed.includes(to)) return false;

  if ((from === TaskStatus.Backlog || from === TaskStatus.Archived) && role !== 'manager') return false;
  if (from === TaskStatus.Ready && role !== 'worker') return false;
  if (from === TaskStatus.InProgress && role !== 'worker') return false;
  if (from === TaskStatus.InReview && role !== 'manager') return false;
  if (to === TaskStatus.Archived && role !== 'manager') return false;

  return true;
}

export const statusGuardMessages: Record<string, string> = {
  ready: 'Backlog -> Ready requires at least one acceptance criteria, at least one DoD item, and explicit dependencies list (or empty array).',
  inReview: 'InProgress -> InReview requires artifact attached and assignee lock owner matched.',
  done: 'InReview -> Done requires reviewer report verdict pass and policy validation.'
};

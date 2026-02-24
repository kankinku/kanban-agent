export const TaskStatus = {
  Backlog: 'Backlog',
  Ready: 'Ready',
  InProgress: 'InProgress',
  InReview: 'InReview',
  Blocked: 'Blocked',
  Done: 'Done',
  Archived: 'Archived'
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskType = {
  feature: 'feature',
  bug: 'bug',
  research: 'research',
  ops: 'ops',
  content: 'content',
  infra: 'infra',
  refactor: 'refactor',
  spike: 'spike'
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  tags: string[];
  type: TaskType;
  priorityModel: number;
  urgency: number;
  riskReduction: number;
  effort: number;
  priorityScore: number;
  mandatory: boolean;
  dueDate: string | null;
  acceptanceCriteria: string[];
  definitionOfDone: string[];
  dependencies: string[];
  parentId: string | null;
  childIds: string[];
  assigneeAgentId: string | null;
  reviewerAgentId: string | null;
  lockId: string | null;
  lockExpiresAt: string | null;
  attemptCount: number;
  maxAttempt: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  cycleTimeMs: number | null;
  leadTimeMs: number | null;
}

export const TASK_STATUSES = ['Backlog', 'Ready', 'InProgress', 'InReview', 'Blocked', 'Done', 'Archived'];
export const ROLE = { WORKER: 'worker', REVIEWER: 'reviewer', MANAGER: 'manager', ADMIN: 'admin' };

export const TRANSITIONS = {
  Backlog: ['Ready', 'Blocked'],
  Ready: ['InProgress', 'Blocked'],
  InProgress: ['InReview', 'Blocked'],
  InReview: ['Done', 'Backlog', 'Ready', 'Blocked'],
  Blocked: ['Backlog', 'Ready', 'InProgress', 'InReview', 'Done', 'Archived'],
  Done: ['Archived', 'Blocked'],
  Archived: []
};

export const READY_CRITERIA_OK = 1;

import { tr } from '../../i18n/messages';
import { useSyncExternalStore } from 'react';
import type { ID } from '../types';

export interface GenerationJob {
  roomId: ID;
  startedAt: number;
  stage: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  error: { message: string; hint: string | null } | null;
  versionIds: ID[];
  controller: AbortController;
}

let jobs: Record<ID, GenerationJob> = {};
const listeners = new Set<() => void>();

function emit() {
  jobs = { ...jobs };
  listeners.forEach((l) => l());
}

export const jobStore = {
  get: (roomId: ID): GenerationJob | undefined => jobs[roomId],
  start(roomId: ID): GenerationJob {
    const job: GenerationJob = {
      roomId,
      startedAt: Date.now(),
      stage: tr().gen.preparing,
      status: 'running',
      error: null,
      versionIds: [],
      controller: new AbortController(),
    };
    jobs[roomId] = job;
    emit();
    return job;
  },
  update(roomId: ID, patch: Partial<GenerationJob>) {
    const j = jobs[roomId];
    if (!j) return;
    jobs[roomId] = { ...j, ...patch };
    emit();
  },
  clear(roomId: ID) {
    delete jobs[roomId];
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => jobs,
};

/** Generation job for a room, kept alive while navigating around the app. */
export function useGenerationJob(roomId: ID | null | undefined): GenerationJob | undefined {
  const all = useSyncExternalStore(jobStore.subscribe, jobStore.snapshot, jobStore.snapshot);
  return roomId ? all[roomId] : undefined;
}

export function isRunning(roomId: ID): boolean {
  return jobs[roomId]?.status === 'running';
}

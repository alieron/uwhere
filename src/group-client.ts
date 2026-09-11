import { isGroupSnapshot } from './group.ts';
import type { GroupContent, GroupSnapshot } from './group.ts';
import { isGroupToken } from './store.ts';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class MissingGroupError extends Error {
  constructor() {
    super('This group no longer exists.');
  }
}

export class GroupConflictError extends Error {
  snapshot: GroupSnapshot;

  constructor(snapshot: GroupSnapshot) {
    super('This group changed elsewhere. Review and try again.');
    this.snapshot = snapshot;
  }
}

export function snapshotForRevision(
  current: GroupSnapshot | null,
  capturedRevision: number,
): GroupSnapshot {
  if (!current) throw new Error('This group is not ready yet. Try again.');
  if (current.revision !== capturedRevision) throw new GroupConflictError(current);
  return current;
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error('The group server returned an invalid response.');
  }
}

function snapshot(value: unknown): GroupSnapshot {
  if (!isGroupSnapshot(value)) throw new Error('The group server returned an invalid response.');
  return value;
}

function errorFor(response: Response): Error {
  return new Error(`The group request failed (${response.status}).`);
}

function authorization(token: string): HeadersInit {
  if (!isGroupToken(token)) throw new Error('Invalid group token');
  return { Authorization: `Bearer ${token}` };
}

export async function createGroup(fetcher: Fetcher = fetch): Promise<{ token: string; snapshot: GroupSnapshot }> {
  const response = await fetcher('/api/group', { method: 'POST' });
  if (response.status !== 201) throw errorFor(response);
  const value = await json(response);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The group server returned an invalid response.');
  }
  const result = value as Record<string, unknown>;
  if (!isGroupToken(result.token)) throw new Error('The group server returned an invalid response.');
  return { token: result.token, snapshot: snapshot(result.snapshot) };
}

export async function getGroup(
  token: string,
  revision?: number,
  fetcher: Fetcher = fetch,
): Promise<GroupSnapshot | null> {
  const headers = new Headers(authorization(token));
  if (revision !== undefined) headers.set('If-None-Match', `"${revision}"`);
  const response = await fetcher('/api/group', { headers });
  if (response.status === 304) return null;
  if (response.status === 404) throw new MissingGroupError();
  if (response.status !== 200) throw errorFor(response);
  return snapshot(await json(response));
}

export async function putGroup(
  token: string,
  base: GroupSnapshot,
  content: GroupContent,
  fetcher: Fetcher = fetch,
): Promise<GroupSnapshot> {
  const response = await fetcher('/api/group', {
    method: 'PUT',
    headers: { ...authorization(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...content, revision: base.revision }),
  });
  if (response.status === 404) throw new MissingGroupError();
  if (response.status === 409) {
    const value = await json(response);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('The group server returned an invalid response.');
    }
    throw new GroupConflictError(snapshot((value as Record<string, unknown>).snapshot));
  }
  if (response.status !== 200) throw errorFor(response);
  return snapshot(await json(response));
}

export async function deleteGroup(
  token: string,
  revision: number,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher('/api/group', {
    method: 'DELETE',
    headers: { ...authorization(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision }),
  });
  if (response.status === 204 || response.status === 404) return;
  if (response.status === 409) {
    const value = await json(response);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('The group server returned an invalid response.');
    }
    throw new GroupConflictError(snapshot((value as Record<string, unknown>).snapshot));
  }
  throw errorFor(response);
}

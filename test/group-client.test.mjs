import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptSnapshot,
  GROUPS_KEY,
  groupInviteUrl,
  groupTokenFromFragment,
  importGroupToken,
  initializeRegistry,
  parseRegistry,
  persistRegistry,
} from '../src/store.ts';
import { deleteGroup, GroupConflictError, putGroup, snapshotForRevision } from '../src/group-client.ts';

const token = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const otherToken = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBQ';
const snapshot = {
  name: 'Study group',
  students: [],
  revision: 2,
  createdAt: '2026-09-10T12:00:00.000Z',
  updatedAt: '2026-09-10T12:01:00.000Z',
};

test('registry parsing validates, deduplicates, and selects a valid token', () => {
  const registry = parseRegistry(JSON.stringify({
    entries: [
      { token, snapshot },
      { token, snapshot: null },
      { token: 'invalid', snapshot },
      { token: otherToken, snapshot: { ...snapshot, revision: -1 } },
      { token: otherToken, snapshot: null },
    ],
    activeToken: 'invalid',
  }));
  assert.deepEqual(registry, {
    entries: [{ token, snapshot }, { token: otherToken, snapshot: null }],
    activeToken: token,
  });
  assert.deepEqual(parseRegistry('{broken'), { entries: [], activeToken: null });
});

test('registry persistence uses only the versioned group key', () => {
  const writes = [];
  const registry = { entries: [{ token, snapshot }], activeToken: token };
  persistRegistry(registry, { setItem: (...args) => writes.push(args), getItem: () => null });
  assert.deepEqual(writes, [[GROUPS_KEY, JSON.stringify(registry)]]);
});

test('registry persistence reports storage failures without throwing', () => {
  const registry = { entries: [{ token, snapshot }], activeToken: token };
  assert.equal(persistRegistry(registry, {
    getItem: () => null,
    setItem: () => { throw new Error('storage unavailable'); },
  }), false);
});

test('fragment import survives initial persistence failure and reports the active token', () => {
  const result = initializeRegistry(`#group=${token}`, {
    getItem: () => null,
    setItem: () => { throw new Error('storage unavailable'); },
  });
  assert.deepEqual(result.registry, {
    entries: [{ token, snapshot: null }],
    activeToken: token,
  });
  assert.equal(result.storageWarningToken, token);
});

test('fragment import is exact, deduplicated, and produces the share URL', () => {
  assert.equal(groupTokenFromFragment(`#group=${token}`), token);
  assert.equal(groupTokenFromFragment(`#group=${token}&extra=1`), null);
  assert.equal(groupTokenFromFragment('#group=short'), null);

  const once = importGroupToken({ entries: [], activeToken: null }, token);
  const twice = importGroupToken(once, token);
  assert.equal(twice.entries.length, 1);
  assert.equal(twice.activeToken, token);
  assert.equal(groupInviteUrl({ origin: 'https://uwhere.test', pathname: '/map', search: '?day=1' }, token),
    `https://uwhere.test/map?day=1#group=${token}`);
});

test('snapshot acceptance is monotonic', () => {
  const newer = { ...snapshot, revision: 4 };
  assert.equal(acceptSnapshot(newer, snapshot), newer);
  assert.equal(acceptSnapshot(snapshot, newer), newer);
});

test('captured revisions conflict against the current snapshot and retry with latest', () => {
  const latest = { ...snapshot, revision: 3 };
  assert.throws(
    () => snapshotForRevision(latest, snapshot.revision),
    (error) => error instanceof GroupConflictError && error.snapshot === latest,
  );
  assert.equal(snapshotForRevision(latest, latest.revision), latest);
  assert.throws(() => snapshotForRevision(null, 0), /not ready yet/i);
});

test('PUT sends the captured revision and exposes a validated conflict snapshot', async () => {
  const serverSnapshot = { ...snapshot, revision: 3 };
  await assert.rejects(
    putGroup(token, snapshot, { name: 'Renamed', students: [] }, async (url, init) => {
      assert.equal(url, '/api/group');
      assert.equal(init.method, 'PUT');
      assert.deepEqual(JSON.parse(init.body), { name: 'Renamed', students: [], revision: 2 });
      return Response.json({ error: 'Conflict', snapshot: serverSnapshot }, { status: 409 });
    }),
    (error) => error instanceof GroupConflictError
      && error.message === 'This group changed elsewhere. Review and try again.'
      && error.snapshot.revision === serverSnapshot.revision,
  );
});

test('DELETE treats a missing group as already deleted', async () => {
  await deleteGroup(token, snapshot.revision, async () => new Response(null, { status: 404 }));
});

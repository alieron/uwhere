import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isGroupContent,
  isGroupSnapshot,
  isScheduleSlot,
  isStudent,
} from '../src/group.ts';
import {
  bearerToken,
  generateGroupToken,
  handleGroupRequest,
  hashGroupToken,
  parseDeleteBody,
  parsePutBody,
  readJsonBody,
} from '../api/group.ts';

const slot = {
  courseCode: 'CS 136',
  classNumber: '12345',
  section: '001',
  component: 'LEC',
  venue: 'MC 2035',
  buildingCode: 'MC',
  day: 'Monday',
  startTime: '0930',
  endTime: '1020',
};
const student = {
  id: '9bdf1695-5079-4a76-894c-cf2f70663f54',
  name: 'Ada',
  color: '#2f80ed',
  term: 'Fall',
  year: 2026,
  slots: [slot],
  addedAt: 1_788_739_200_000,
};
const snapshot = {
  name: 'Untitled group',
  students: [],
  revision: 0,
  createdAt: '2026-09-10T12:00:00.000Z',
  updatedAt: '2026-09-10T12:00:00.000Z',
};

test('validates the complete shared model and rejects malformed boundaries', () => {
  assert.equal(isScheduleSlot(slot), true);
  assert.equal(isStudent(student), true);
  assert.equal(isGroupContent({ name: 'Study group', students: [student] }), true);
  assert.equal(isGroupSnapshot({ ...snapshot, students: [student] }), true);

  assert.equal(isScheduleSlot({ ...slot, startTime: '2400' }), false);
  assert.equal(isScheduleSlot({ ...slot, endTime: '0900' }), false);
  assert.equal(isScheduleSlot({ ...slot, day: 'Sunday' }), false);
  assert.equal(isStudent({ ...student, color: 'red' }), false);
  assert.equal(isStudent({ ...student, year: 1999 }), false);
  assert.equal(isStudent({ ...student, addedAt: Number.POSITIVE_INFINITY }), false);
  assert.equal(isStudent({ ...student, extra: true }), false);
  assert.equal(isGroupContent({ name: ' Study group ', students: [] }), false);
  assert.equal(isGroupContent({ name: 'Study group', students: [student, { ...student }] }), false);
  assert.equal(isGroupSnapshot({ ...snapshot, revision: 0.5 }), false);
});

test('enforces collection limits', () => {
  assert.equal(isStudent({ ...student, slots: Array(501).fill(slot) }), false);
  assert.equal(isGroupContent({
    name: 'Large group',
    students: Array.from({ length: 101 }, (_, index) => ({ ...student, id: `student-${index}` })),
  }), false);
});

test('generates canonical tokens and hashes deterministically', () => {
  const token = generateGroupToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.equal(hashGroupToken('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a');
});

test('accepts only canonical bearer tokens', () => {
  const token = Buffer.alloc(32, 7).toString('base64url');
  assert.equal(bearerToken(new Request('https://example.test/api/group', {
    headers: { Authorization: `Bearer ${token}` },
  })), token);
  assert.equal(bearerToken(new Request(`https://example.test/api/group?token=${token}`)), null);
  assert.equal(bearerToken(new Request('https://example.test/api/group', {
    headers: { Authorization: `Bearer ${token.slice(1)}` },
  })), null);
});

test('parses only exact mutation bodies and caps JSON at 256 KiB', async () => {
  assert.deepEqual(parsePutBody({ name: 'Team', students: [], revision: 3 }), {
    content: { name: 'Team', students: [] },
    revision: 3,
  });
  assert.equal(parsePutBody({ name: 'Team', students: [], revision: 3, extra: true }), null);
  assert.equal(parsePutBody({ name: 'Team', students: [], revision: 3.5 }), null);
  assert.deepEqual(parseDeleteBody({ revision: 3 }), { revision: 3 });
  assert.equal(parseDeleteBody({ revision: 3, token: 'nope' }), null);

  await assert.rejects(
    readJsonBody(new Request('https://example.test/api/group', {
      method: 'PUT',
      body: JSON.stringify({ value: 'x'.repeat(256 * 1024) }),
    })),
    (error) => error.status === 413,
  );
});

test('handles create, conditional reads, stale writes, and revision deletes', async () => {
  let current = null;
  let createdHash = '';
  const repository = {
    async create(tokenHash) {
      createdHash = tokenHash;
      current = { ...snapshot };
      return current;
    },
    async read() {
      return current;
    },
    async update(_tokenHash, revision, content) {
      if (!current) return { updated: false, snapshot: null };
      if (revision !== current.revision) return { updated: false, snapshot: current };
      current = { ...current, ...content, revision: current.revision + 1, updatedAt: '2026-09-10T12:01:00.000Z' };
      return { updated: true, snapshot: current };
    },
    async delete(_tokenHash, revision) {
      if (!current) return { deleted: false, snapshot: null };
      if (revision !== current.revision) return { deleted: false, snapshot: current };
      current = null;
      return { deleted: true, snapshot: null };
    },
  };

  const created = await handleGroupRequest(new Request('https://example.test/api/group', {
    method: 'POST',
    body: '',
  }), repository);
  const creation = await created.json();
  assert.equal(created.status, 201);
  assert.match(creation.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(createdHash, hashGroupToken(creation.token));
  assert.deepEqual(creation.snapshot, snapshot);

  const crossSite = await handleGroupRequest(new Request('https://example.test/api/group', {
    method: 'POST',
    headers: { Origin: 'https://attacker.test' },
  }), repository);
  assert.equal(crossSite.status, 403);

  const headers = { Authorization: `Bearer ${creation.token}` };
  const fetched = await handleGroupRequest(new Request('https://example.test/api/group', { headers }), repository);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('etag'), '"0"');
  assert.match(fetched.headers.get('cache-control'), /private/);
  assert.match(fetched.headers.get('cache-control'), /no-store/);

  const unchanged = await handleGroupRequest(new Request('https://example.test/api/group', {
    headers: { ...headers, 'If-None-Match': '"0"' },
  }), repository);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');

  const updated = await handleGroupRequest(new Request('https://example.test/api/group', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Team', students: [], revision: 0 }),
  }), repository);
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).revision, 1);

  const stale = await handleGroupRequest(new Request('https://example.test/api/group', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Old', students: [], revision: 0 }),
  }), repository);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).snapshot.revision, 1);

  const staleDelete = await handleGroupRequest(new Request('https://example.test/api/group', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ revision: 0 }),
  }), repository);
  assert.equal(staleDelete.status, 409);

  const deleted = await handleGroupRequest(new Request('https://example.test/api/group', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ revision: 1 }),
  }), repository);
  assert.equal(deleted.status, 204);

  const missing = await handleGroupRequest(new Request('https://example.test/api/group', { headers }), repository);
  assert.equal(missing.status, 404);
});

test('rejects unauthenticated requests before repository access', async () => {
  const repository = new Proxy({}, {
    get() { throw new Error('repository should not be called'); },
  });
  const response = await handleGroupRequest(new Request('https://example.test/api/group'), repository);
  assert.equal(response.status, 401);
});

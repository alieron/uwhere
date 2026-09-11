import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import type { GroupContent, GroupSnapshot } from '../src/group.ts';

const MAX_BODY_BYTES = 256 * 1024;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,63})$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME = /^(?:[01]\d|2[0-3])[0-5]\d$/;
const TERMS = new Set(['Winter', 'Spring', 'Fall']);
const DAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const STUDENT_KEYS = ['id', 'name', 'color', 'term', 'year', 'slots', 'addedAt'] as const;
const SLOT_KEYS = ['courseCode', 'classNumber', 'section', 'component', 'venue', 'buildingCode', 'day', 'startTime', 'endTime'] as const;
const GROUP_KEYS = ['name', 'students'] as const;
const SNAPSHOT_KEYS = ['name', 'students', 'revision', 'createdAt', 'updatedAt'] as const;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Authorization',
} as const;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= max && (allowEmpty || value.length > 0);
}

function isScheduleSlot(value: unknown): boolean {
  const slot = record(value);
  if (!slot || !exactKeys(slot, SLOT_KEYS)) return false;
  return boundedString(slot.courseCode, 80)
    && boundedString(slot.classNumber, 64)
    && boundedString(slot.section, 32)
    && boundedString(slot.component, 32)
    && boundedString(slot.venue, 200, true)
    && boundedString(slot.buildingCode, 32, true)
    && typeof slot.day === 'string' && DAYS.has(slot.day)
    && typeof slot.startTime === 'string' && TIME.test(slot.startTime)
    && typeof slot.endTime === 'string' && TIME.test(slot.endTime)
    && slot.endTime > slot.startTime;
}

function isStudent(value: unknown): boolean {
  const student = record(value);
  if (!student || !exactKeys(student, STUDENT_KEYS)) return false;
  return typeof student.id === 'string' && ID.test(student.id)
    && boundedString(student.name, 80) && student.name === student.name.trim()
    && typeof student.color === 'string' && COLOR.test(student.color)
    && typeof student.term === 'string' && TERMS.has(student.term)
    && Number.isInteger(student.year) && Number(student.year) >= 2000 && Number(student.year) <= 2100
    && Number.isSafeInteger(student.addedAt) && Number(student.addedAt) >= 0
    && Array.isArray(student.slots) && student.slots.length <= 500 && student.slots.every(isScheduleSlot);
}

function isGroupContent(value: unknown): value is GroupContent {
  const group = record(value);
  if (!group || !exactKeys(group, GROUP_KEYS)) return false;
  if (!boundedString(group.name, 80) || group.name !== group.name.trim()) return false;
  if (!Array.isArray(group.students) || group.students.length > 100 || !group.students.every(isStudent)) return false;
  return new Set(group.students.map((student) => record(student)?.id)).size === group.students.length;
}

function isGroupSnapshot(value: unknown): value is GroupSnapshot {
  const group = record(value);
  return Boolean(group
    && exactKeys(group, SNAPSHOT_KEYS)
    && isGroupContent({ name: group.name, students: group.students })
    && Number.isSafeInteger(group.revision) && Number(group.revision) >= 0
    && typeof group.createdAt === 'string' && group.createdAt.length <= 40 && Number.isFinite(Date.parse(group.createdAt))
    && typeof group.updatedAt === 'string' && group.updatedAt.length <= 40 && Number.isFinite(Date.parse(group.updatedAt)));
}

export type GroupRepository = {
  create(tokenHash: string): Promise<GroupSnapshot>;
  read(tokenHash: string): Promise<GroupSnapshot | null>;
  update(tokenHash: string, revision: number, content: GroupContent): Promise<{ updated: boolean; snapshot: GroupSnapshot | null }>;
  delete(tokenHash: string, revision: number): Promise<{ deleted: boolean; snapshot: GroupSnapshot | null }>;
};

export class RequestError extends Error {
  status: number;

  constructor(status: number) {
    super('Invalid request');
    this.status = status;
  }
}

function json(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(value, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

function empty(status: number, headers?: Record<string, string>): Response {
  return new Response(null, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

function error(status: number, message: string, extra?: object): Response {
  return json({ error: message, ...extra }, status, status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined);
}

export function generateGroupToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashGroupToken(token: string): string {
  return createHash('sha256').update(token, 'ascii').digest('hex');
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  if (!TOKEN.test(token)) return null;
  const bytes = Buffer.from(token, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === token ? token : null;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    throw new RequestError(413);
  }
  if (!request.body) throw new RequestError(400);

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (caught) {
    if (caught instanceof RequestError) throw caught;
    throw new RequestError(400);
  }
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function parsePutBody(value: unknown): { revision: number; content: GroupContent } | null {
  if (!exactObject(value, ['name', 'students', 'revision'])) return null;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return null;
  const content = { name: value.name, students: value.students };
  return isGroupContent(content) ? { revision: value.revision as number, content } : null;
}

export function parseDeleteBody(value: unknown): { revision: number } | null {
  return exactObject(value, ['revision'])
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 0
    ? { revision: value.revision as number }
    : null;
}

function etag(revision: number): string {
  return `"${revision}"`;
}

function etagMatches(header: string | null, current: string): boolean {
  return header?.split(',').some((candidate) => {
    const normalized = candidate.trim();
    return normalized === '*' || normalized === current || normalized === `W/${current}`;
  }) ?? false;
}

function isCrossSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  return request.headers.get('sec-fetch-site') === 'cross-site'
    || Boolean(origin && origin !== new URL(request.url).origin);
}

export async function handleGroupRequest(
  request: Request,
  repository: GroupRepository,
  method = request.method.toUpperCase(),
): Promise<Response> {
  if (method === 'POST') {
    if (isCrossSite(request)) return error(403, 'Forbidden');
    const token = generateGroupToken();
    const snapshot = await repository.create(hashGroupToken(token));
    return json({ token, snapshot }, 201);
  }

  const token = bearerToken(request);
  if (!token) return error(401, 'Unauthorized');
  const tokenHash = hashGroupToken(token);

  if (!['GET', 'PUT', 'DELETE'].includes(method)) return error(405, 'Method not allowed');

  if (method === 'GET') {
    const snapshot = await repository.read(tokenHash);
    if (!snapshot) return error(404, 'Not found');
    const currentEtag = etag(snapshot.revision);
    return etagMatches(request.headers.get('if-none-match'), currentEtag)
      ? empty(304, { ETag: currentEtag })
      : json(snapshot, 200, { ETag: currentEtag });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (caught) {
    return error(caught instanceof RequestError ? caught.status : 400, caught instanceof RequestError && caught.status === 413 ? 'Payload too large' : 'Invalid request');
  }

  if (method === 'PUT') {
    const mutation = parsePutBody(body);
    if (!mutation) return error(400, 'Invalid request');
    const result = await repository.update(tokenHash, mutation.revision, mutation.content);
    if (!result.snapshot) return error(404, 'Not found');
    return result.updated
      ? json(result.snapshot, 200, { ETag: etag(result.snapshot.revision) })
      : error(409, 'Conflict', { snapshot: result.snapshot });
  }

  if (method === 'DELETE') {
    const deletion = parseDeleteBody(body);
    if (!deletion) return error(400, 'Invalid request');
    const result = await repository.delete(tokenHash, deletion.revision);
    if (result.deleted) return empty(204);
    return result.snapshot
      ? error(409, 'Conflict', { snapshot: result.snapshot })
      : error(404, 'Not found');
  }

  return error(405, 'Method not allowed');
}

function snapshot(row: unknown): GroupSnapshot {
  if (!isGroupSnapshot(row)) throw new Error('Invalid database row');
  return row;
}

function databaseRepository(): GroupRepository {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing database configuration');
  const sql = neon(databaseUrl);

  const read = async (tokenHash: string): Promise<GroupSnapshot | null> => {
    const rows = await sql`
      SELECT name, students, revision,
        to_json(created_at)#>>'{}' AS "createdAt",
        to_json(updated_at)#>>'{}' AS "updatedAt"
      FROM groups
      WHERE token_hash = ${tokenHash}
    ` as unknown[];
    return rows.length ? snapshot(rows[0]) : null;
  };

  return {
    async create(tokenHash) {
      const rows = await sql`
        INSERT INTO groups (token_hash, name, students, revision)
        VALUES (${tokenHash}, ${'Untitled group'}, ${JSON.stringify([])}::jsonb, 0)
        RETURNING name, students, revision,
          to_json(created_at)#>>'{}' AS "createdAt",
          to_json(updated_at)#>>'{}' AS "updatedAt"
      ` as unknown[];
      return snapshot(rows[0]);
    },
    read,
    async update(tokenHash, revision, content) {
      const rows = await sql`
        UPDATE groups
        SET name = ${content.name}, students = ${JSON.stringify(content.students)}::jsonb,
          revision = revision + 1, updated_at = now()
        WHERE token_hash = ${tokenHash} AND revision = ${revision}
        RETURNING name, students, revision,
          to_json(created_at)#>>'{}' AS "createdAt",
          to_json(updated_at)#>>'{}' AS "updatedAt"
      ` as unknown[];
      if (rows.length) return { updated: true, snapshot: snapshot(rows[0]) };
      return { updated: false, snapshot: await read(tokenHash) };
    },
    async delete(tokenHash, revision) {
      const rows = await sql`
        DELETE FROM groups
        WHERE token_hash = ${tokenHash} AND revision = ${revision}
        RETURNING token_hash
      ` as unknown[];
      if (rows.length) return { deleted: true, snapshot: null };
      return { deleted: false, snapshot: await read(tokenHash) };
    },
  };
}

async function run(request: Request, method: string): Promise<Response> {
  try {
    return await handleGroupRequest(request, databaseRepository(), method);
  } catch {
    return error(500, 'Internal server error');
  }
}

export function POST(request: Request): Promise<Response> {
  return run(request, 'POST');
}

export function GET(request: Request): Promise<Response> {
  return run(request, 'GET');
}

export function PUT(request: Request): Promise<Response> {
  return run(request, 'PUT');
}

export function DELETE(request: Request): Promise<Response> {
  return run(request, 'DELETE');
}

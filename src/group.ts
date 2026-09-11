import { DAYS, TERMS } from './waterloo.ts';
import type { ScheduleSlot, Term } from './waterloo.ts';

export interface Student {
  id: string;
  name: string;
  color: string;
  term: Term;
  year: number;
  slots: ScheduleSlot[];
  addedAt: number;
}

export interface GroupContent {
  name: string;
  students: Student[];
}

export interface GroupSnapshot extends GroupContent {
  revision: number;
  createdAt: string;
  updatedAt: string;
}

const STUDENT_KEYS = ['id', 'name', 'color', 'term', 'year', 'slots', 'addedAt'] as const;
const SLOT_KEYS = ['courseCode', 'classNumber', 'section', 'component', 'venue', 'buildingCode', 'day', 'startTime', 'endTime'] as const;
const GROUP_KEYS = ['name', 'students'] as const;
const SNAPSHOT_KEYS = ['name', 'students', 'revision', 'createdAt', 'updatedAt'] as const;
const ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,63})$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME = /^(?:[01]\d|2[0-3])[0-5]\d$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isBoundedString(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= max && (allowEmpty || value.length > 0);
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value);
}

export function isScheduleSlot(value: unknown): value is ScheduleSlot {
  if (!isObject(value) || !hasExactKeys(value, SLOT_KEYS)) return false;
  return isBoundedString(value.courseCode, 80)
    && isBoundedString(value.classNumber, 64)
    && isBoundedString(value.section, 32)
    && isBoundedString(value.component, 32)
    && isBoundedString(value.venue, 200, true)
    && isBoundedString(value.buildingCode, 32, true)
    && typeof value.day === 'string'
    && DAYS.includes(value.day as ScheduleSlot['day'])
    && isTime(value.startTime)
    && isTime(value.endTime)
    && value.endTime > value.startTime;
}

export function isStudent(value: unknown): value is Student {
  return isObject(value)
    && hasExactKeys(value, STUDENT_KEYS)
    && typeof value.id === 'string'
    && ID.test(value.id)
    && isBoundedString(value.name, 80)
    && value.name === value.name.trim()
    && typeof value.color === 'string'
    && COLOR.test(value.color)
    && typeof value.term === 'string'
    && TERMS.includes(value.term as Term)
    && Number.isInteger(value.year)
    && (value.year as number) >= 2000
    && (value.year as number) <= 2100
    && Number.isSafeInteger(value.addedAt)
    && (value.addedAt as number) >= 0
    && Array.isArray(value.slots)
    && value.slots.length <= 500
    && value.slots.every(isScheduleSlot);
}

export function isGroupContent(value: unknown): value is GroupContent {
  if (!isObject(value) || !hasExactKeys(value, GROUP_KEYS)) return false;
  if (!isBoundedString(value.name, 80) || value.name !== value.name.trim()) return false;
  if (!Array.isArray(value.students) || value.students.length > 100 || !value.students.every(isStudent)) return false;
  return new Set(value.students.map((student) => student.id)).size === value.students.length;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 40
    && Number.isFinite(Date.parse(value));
}

export function isGroupSnapshot(value: unknown): value is GroupSnapshot {
  return isObject(value)
    && hasExactKeys(value, SNAPSHOT_KEYS)
    && isGroupContent({ name: value.name, students: value.students })
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 0
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt);
}

import { DAYS, TERMS, defaultColor } from './waterloo';
import type { BuildingLocation, ParsedSchedule, ScheduleSlot, Term } from './waterloo';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  color: string;
  term: Term;
  year: number;
  slots: ScheduleSlot[];
  addedAt: number;
}

export type StudentPatch = Partial<Pick<Student, 'name' | 'color' | 'term' | 'year' | 'slots'>>;

export interface AppState {
  students: Student[];
  buildingLocations: Record<string, BuildingLocation>;
  buildingsLoaded: boolean;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STUDENTS_KEY = 'uwhere_waterloo_students';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isSlot(value: unknown): value is ScheduleSlot {
  if (!isObject(value)) return false;
  return ['courseCode', 'classNumber', 'section', 'component', 'venue', 'buildingCode', 'startTime', 'endTime']
    .every((key) => typeof value[key] === 'string')
    && typeof value.day === 'string'
    && DAYS.includes(value.day as ScheduleSlot['day']);
}

function isStudent(value: unknown): value is Student {
  return isObject(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.color === 'string'
    && typeof value.term === 'string'
    && TERMS.includes(value.term as Term)
    && Number.isInteger(value.year)
    && typeof value.addedAt === 'number'
    && Array.isArray(value.slots)
    && value.slots.every(isSlot);
}

export function loadStudents(): Student[] {
  try {
    const raw = localStorage.getItem(STUDENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isStudent) : [];
  } catch { return []; }
}

export function persistStudents(list: Student[]): void {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(list));
}

// ── Actions (pure async functions that call setState) ─────────────────────────
// These take a React setState dispatcher so there is no singleton state here.
// state lives in the React tree where it belongs.

type SetState = React.Dispatch<React.SetStateAction<AppState>>;

export async function loadBuildings(setState: SetState): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/buildings.json`);
    if (!res.ok) throw new Error(`Building data could not be loaded (${res.status})`);
    const buildings = await res.json() as Record<string, BuildingLocation>;
    setState(s => ({ ...s, buildingLocations: buildings, buildingsLoaded: true }));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
  }
}

export function addStudent(
  schedule: ParsedSchedule,
  name: string,
  color: string | undefined,
  state: AppState,
  setState: SetState,
): void {
  const id = crypto.randomUUID?.() ?? [...crypto.getRandomValues(new Uint32Array(4))].join('-');
  const student: Student = {
    id,
    name: name.trim() || `Person ${state.students.length + 1}`,
    color: color || defaultColor(state.students.length),
    term: schedule.term,
    year: schedule.year,
    slots: schedule.slots,
    addedAt: Date.now(),
  };
  const newList = [...state.students, student];
  persistStudents(newList);
  setState(s => ({ ...s, students: newList }));
}

export function updateStudent(id: string, patch: StudentPatch, setState: SetState): void {
  setState(s => {
    const newList = s.students.map(st => st.id === id ? { ...st, ...patch } : st);
    persistStudents(newList);
    return { ...s, students: newList };
  });
}

export function moveStudent(id: string, offset: number, setState: SetState): void {
  setState(s => {
    const from = s.students.findIndex(student => student.id === id);
    const to = Math.min(s.students.length - 1, Math.max(0, from + offset));
    if (from < 0 || from === to) return s;
    const students = [...s.students];
    const [student] = students.splice(from, 1);
    students.splice(to, 0, student);
    persistStudents(students);
    return { ...s, students };
  });
}

export function removeStudent(id: string, setState: SetState): void {
  setState(s => {
    const newList = s.students.filter(st => st.id !== id);
    persistStudents(newList);
    return { ...s, students: newList };
  });
}

export function initialState(): AppState {
  return {
    students: loadStudents(),
    buildingLocations: {},
    buildingsLoaded: false,
  };
}

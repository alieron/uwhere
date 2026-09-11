export const TERMS = ['Winter', 'Spring', 'Fall'] as const;
export type Term = typeof TERMS[number];

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type Day = typeof DAYS[number];

export interface ScheduleSlot {
  courseCode: string;
  classNumber: string;
  section: string;
  component: string;
  venue: string;
  buildingCode: string;
  day: Day;
  startTime: string;
  endTime: string;
}

export interface ParsedSchedule {
  term: Term;
  year: number;
  slots: ScheduleSlot[];
}

export interface BuildingLocation {
  name: string;
  lat: number;
  lng: number;
}

const DAY_TOKENS: [string, Day][] = [
  ['Th', 'Thursday'],
  ['Sa', 'Saturday'],
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['F', 'Friday'],
];
const TIME_LINE = /^((?:Th|Sa|Su|M|T|W|F)+)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i;
const MODERN_HEADING = /^([A-Z]{2,}(?:\s+[A-Z]{2,})?\s+\d+[A-Z]?)\s+-\s+.+$/i;
const OLD_HEADING = /^([A-Z]{2,}(?:\s+[A-Z]{2,})?\s+\d+[A-Z]?)-(\d{3})$/i;

export function currentWaterlooTerm(date = new Date()): { term: Term; year: number } {
  const month = date.getMonth();
  return {
    term: month < 4 ? 'Winter' : month < 8 ? 'Spring' : 'Fall',
    year: date.getFullYear(),
  };
}

function clockToTime(value: string): string | null {
  const match = value.replace(/\s+/g, '').match(/^(\d{1,2}):(\d{2})(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (meridiem) {
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
  }
  return `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
}

function parseDays(value: string): Day[] | null {
  const days: Day[] = [];
  let rest = value;
  while (rest) {
    const token = DAY_TOKENS.find(([candidate]) => rest.toLowerCase().startsWith(candidate.toLowerCase()));
    if (!token) return null;
    days.push(token[1]);
    rest = rest.slice(token[0].length);
  }
  return days;
}

function parseTimeLine(line: string) {
  const match = line.match(TIME_LINE);
  if (!match) return null;
  const days = parseDays(match[1]);
  const startTime = clockToTime(match[2]);
  const endTime = clockToTime(match[3]);
  return days && startTime && endTime && timeToMinutes(endTime) > timeToMinutes(startTime)
    ? { days, startTime, endTime }
    : null;
}

function modernMetadata(lines: string[], index: number) {
  const combined = lines[index]?.match(/^\(?(\d{4,8})\)?\s+(\d{3})\s+([A-Z]{2,10})$/i);
  if (combined) return { classNumber: combined[1], section: combined[2], component: combined[3].toUpperCase(), length: 1 };

  const classNumber = lines[index]?.match(/^\(?(\d{4,8})\)?$/)?.[1];
  const section = lines[index + 1]?.match(/^\d{3}$/)?.[0];
  const component = lines[index + 2]?.match(/^[A-Z]{2,10}$/i)?.[0];
  return classNumber && section && component
    ? { classNumber, section, component: component.toUpperCase(), length: 3 }
    : null;
}

function roomDetails(line: string | undefined) {
  const normalized = line?.trim() ?? '';
  const match = normalized.match(/^([A-Z][A-Z0-9-]*)\s+\S+/i);
  if (!match || /^(TBA|ONLINE|ONLN\s*-\s*ONLINE)$/i.test(normalized)) return { venue: normalized, buildingCode: '' };
  return { venue: normalized, buildingCode: match[1].toUpperCase() };
}

export function parseWaterlooSchedule(text: string): ParsedSchedule {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—−]/g, '-');
  const termMatch = normalized.match(/\b(Winter|Spring|Fall)\s+(\d{4})\b/i);
  if (!termMatch) throw new Error('Could not find a Waterloo term such as Fall 2026.');

  const term = `${termMatch[1][0].toUpperCase()}${termMatch[1].slice(1).toLowerCase()}` as Term;
  const year = Number(termMatch[2]);
  const lines = normalized
    .split(/\n|\t+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const slots: ScheduleSlot[] = [];
  const seen = new Set<string>();

  function addMeeting(
    courseCode: string,
    classNumber: string,
    section: string,
    component: string,
    timeLine: ReturnType<typeof parseTimeLine>,
    roomLine: string | undefined,
  ) {
    if (!timeLine || /^(TST|EXAM)$/i.test(component)) return;
    const room = roomDetails(roomLine);
    for (const day of timeLine.days) {
      const slot = {
        courseCode,
        classNumber,
        section,
        component,
        ...room,
        day,
        startTime: timeLine.startTime,
        endTime: timeLine.endTime,
      };
      const key = JSON.stringify(slot);
      if (!seen.has(key)) {
        seen.add(key);
        slots.push(slot);
      }
    }
  }

  for (let index = 0; index < lines.length;) {
    const oldHeading = lines[index].match(OLD_HEADING);
    if (oldHeading) {
      const courseCode = oldHeading[1].toUpperCase();
      const section = oldHeading[2];
      let end = index + 1;
      while (end < lines.length && !OLD_HEADING.test(lines[end]) && !MODERN_HEADING.test(lines[end])) end++;
      const classIndex = lines.slice(index + 1, end).findIndex((line) => /^\(\d{4,8}\)$/.test(line));
      const absoluteClassIndex = classIndex < 0 ? -1 : index + 1 + classIndex;
      const componentIndex = absoluteClassIndex < 0
        ? -1
        : lines.slice(absoluteClassIndex + 1, end).findIndex((line) => /\([A-Z]{2,10}\)$/i.test(line));
      const absoluteComponentIndex = componentIndex < 0 ? -1 : absoluteClassIndex + 1 + componentIndex;
      if (absoluteClassIndex >= 0 && absoluteComponentIndex >= 0) {
        const classNumber = lines[absoluteClassIndex].slice(1, -1);
        const component = lines[absoluteComponentIndex].match(/\(([A-Z]{2,10})\)$/i)![1].toUpperCase();
        let timeIndex = absoluteComponentIndex + 1;
        while (timeIndex < end && !parseTimeLine(lines[timeIndex])) timeIndex++;
        const times = [];
        while (timeIndex < end) {
          const parsed = parseTimeLine(lines[timeIndex]);
          if (!parsed) break;
          times.push(parsed);
          timeIndex++;
        }
        times.forEach((time, offset) => addMeeting(
          courseCode,
          classNumber,
          section,
          component,
          time,
          lines[timeIndex + offset],
        ));
      }
      index = end;
      continue;
    }

    const heading = lines[index].match(MODERN_HEADING);
    if (!heading) {
      index++;
      continue;
    }
    const courseCode = heading[1].toUpperCase();
    let courseEnd = index + 1;
    while (courseEnd < lines.length && !OLD_HEADING.test(lines[courseEnd]) && !MODERN_HEADING.test(lines[courseEnd])) courseEnd++;
    if (lines.slice(index + 1, courseEnd).some((line) => /^(Dropped|Waitlisted)$/i.test(line))) {
      index = courseEnd;
      continue;
    }
    index++;
    while (index < lines.length && !OLD_HEADING.test(lines[index]) && !MODERN_HEADING.test(lines[index])) {
      const metadata = modernMetadata(lines, index);
      if (!metadata) {
        index++;
        continue;
      }
      index += metadata.length;
      while (index < lines.length && !OLD_HEADING.test(lines[index]) && !MODERN_HEADING.test(lines[index]) && !modernMetadata(lines, index)) {
        const time = parseTimeLine(lines[index]);
        if (time) {
          addMeeting(courseCode, metadata.classNumber, metadata.section, metadata.component, time, lines[index + 1]);
          index += 2;
        } else {
          index++;
        }
      }
    }
  }

  if (!slots.length) throw new Error('No recurring timed classes were found in the pasted schedule.');
  return { term, year, slots };
}

export function timeToMinutes(t: string): number {
  return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2), 10);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}

export function formatMinutes(mins: number): string {
  return formatTime(minutesToTime(mins));
}

export function formatTime(t: string): string {
  const mins = timeToMinutes(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const PALETTE = [
  '#2f80ed', '#16a34a', '#f59e0b', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#4b5563',
  '#0f766e', '#ea580c', '#9333ea', '#64748b',
] as const;

export function defaultColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

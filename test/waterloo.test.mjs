import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWaterlooSchedule } from '../src/waterloo.ts';

test('parses current Quest List View meetings', () => {
  const schedule = parseWaterlooSchedule([
    'Fall 2026',
    'PMATH 432 – Mathematical Logic',
    'Class Number',
    '12345678',
    '001',
    'LEC',
    'MWF 8:30AM - 9:20AM',
    'E2\u00a01736',
    'Th 1:30PM — 2:20PM',
    'MC 4045',
    'Th 1:30PM - 2:20PM',
    'MC 4045',
    '12345679',
    '081',
    'TST',
    'T 6:30PM - 8:20PM',
    'PAC 1001',
  ].join('\r\n'));

  assert.equal(schedule.term, 'Fall');
  assert.equal(schedule.year, 2026);
  assert.deepEqual(schedule.slots.map(({ courseCode, classNumber, section, component, day, startTime, endTime, venue, buildingCode }) => ({
    courseCode, classNumber, section, component, day, startTime, endTime, venue, buildingCode,
  })), [
    { courseCode: 'PMATH 432', classNumber: '12345678', section: '001', component: 'LEC', day: 'Monday', startTime: '0830', endTime: '0920', venue: 'E2 1736', buildingCode: 'E2' },
    { courseCode: 'PMATH 432', classNumber: '12345678', section: '001', component: 'LEC', day: 'Wednesday', startTime: '0830', endTime: '0920', venue: 'E2 1736', buildingCode: 'E2' },
    { courseCode: 'PMATH 432', classNumber: '12345678', section: '001', component: 'LEC', day: 'Friday', startTime: '0830', endTime: '0920', venue: 'E2 1736', buildingCode: 'E2' },
    { courseCode: 'PMATH 432', classNumber: '12345678', section: '001', component: 'LEC', day: 'Thursday', startTime: '1330', endTime: '1420', venue: 'MC 4045', buildingCode: 'MC' },
  ]);
});

test('keeps online meetings off the physical map', () => {
  const schedule = parseWaterlooSchedule(`
    Spring 2026
    CS 136 - Elementary Algorithm Design
    12345
    001
    LEC
    TTh 12:00PM - 1:20PM
    ONLN - Online
  `);

  assert.equal(schedule.slots.length, 2);
  assert.equal(schedule.slots[0].venue, 'ONLN - Online');
  assert.equal(schedule.slots[0].buildingCode, '');
});

test('ignores dropped and waitlisted courses', () => {
  const schedule = parseWaterlooSchedule(`
    Fall 2026
    CS 136 - Elementary Algorithm Design
    Dropped
    12345
    001
    LEC
    MWF 9:30AM - 10:20AM
    MC 2035
    MATH 138 - Calculus 2
    Enrolled
    12346
    001
    LEC
    TTh 10:00AM - 11:20AM
    RCH 101
  `);

  assert.deepEqual([...new Set(schedule.slots.map((slot) => slot.courseCode))], ['MATH 138']);
});

test('parses old UWFlow grouped time and room rows', () => {
  const schedule = parseWaterlooSchedule(`
    Winter 2024
    ME 235-101
    (4897)
    Materials Science & Eng (TUT)
    T 9:30AM - 10:20AM
    Th 11:30AM - 12:20PM
    DWE 1501
    RCH 101
  `);

  assert.deepEqual(schedule.slots, [
    { courseCode: 'ME 235', classNumber: '4897', section: '101', component: 'TUT', venue: 'DWE 1501', buildingCode: 'DWE', day: 'Tuesday', startTime: '0930', endTime: '1020' },
    { courseCode: 'ME 235', classNumber: '4897', section: '101', component: 'TUT', venue: 'RCH 101', buildingCode: 'RCH', day: 'Thursday', startTime: '1130', endTime: '1220' },
  ]);
});

test('rejects missing terms and schedules without recurring timed classes', () => {
  assert.throws(() => parseWaterlooSchedule('PMATH 432 - Mathematical Logic'), /Waterloo term/);
  assert.throws(() => parseWaterlooSchedule(`
    Spring 2026
    PMATH 432 - Mathematical Logic
    12345
    001
    LEC
    TBA
  `), /No recurring timed classes/);
});

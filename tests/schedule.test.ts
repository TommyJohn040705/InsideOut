import { describe, expect, it } from 'vitest';
import { nextClass, parseSchedule } from '../src/campus/schedule';

const QUEST = `CS 135 - Designing Functional Programs
Status	Units	Grading
Enrolled	0.50	Numeric Grading Basis
Class Nbr	Section	Component	Days & Times	Room	Instructor	Start/End Date
5432	001	LEC	TTh 10:00AM - 11:20AM	MC 2065	Staff	2026/09/08 - 2026/12/05
5433	102	TUT	F 2:30PM - 3:20PM	MC 4064	Staff	2026/09/08 - 2026/12/05
MATH 135 - Algebra for Honours Mathematics
5501	003	LEC	MWF 8:30AM - 9:20AM	DC 1351	Staff	2026/09/08 - 2026/12/05`;

const ICS = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:ECE 140 LEC
LOCATION:E7 4053
DTSTART;TZID=America/Toronto:20260909T133000
DTEND;TZID=America/Toronto:20260909T142000
RRULE:FREQ=WEEKLY;UNTIL=20261205T000000Z;BYDAY=MO,WE
END:VEVENT
BEGIN:VEVENT
SUMMARY:Midterm
LOCATION:PAC 1001
DTSTART:20261021T190000
DTEND:20261021T210000
END:VEVENT
END:VCALENDAR`;

describe('my classes', () => {
  it('reads the Quest list view', () => {
    const ms = parseSchedule(QUEST);
    expect(ms).toHaveLength(3);
    expect(ms[0]).toMatchObject({ course: 'CS 135 LEC', days: [2, 4], start: 600, end: 680, room: 'MC 2065', from: '2026-09-08', until: '2026-12-05' });
    expect(ms[1]).toMatchObject({ course: 'CS 135 TUT', days: [5], start: 870, room: 'MC 4064' });
    expect(ms[2]).toMatchObject({ course: 'MATH 135 LEC', days: [1, 3, 5], start: 510, room: 'DC 1351' });
  });

  it('reads an .ics calendar: weekly classes and one-off events', () => {
    const ms = parseSchedule(ICS);
    expect(ms[0]).toMatchObject({ course: 'ECE 140 LEC', days: [1, 3], start: 810, end: 860, room: 'E7 4053', until: '2026-12-05' });
    expect(ms[1]).toMatchObject({ course: 'Midterm', days: [3], room: 'PAC 1001', from: '2026-10-21', until: '2026-10-21' });
  });

  it('finds the class on now, then the next one, and respects term dates', () => {
    const ms = parseSchedule(QUEST);
    // Tuesday 2026-11-17 10:15: CS 135 lecture is on now.
    expect(nextClass(ms, new Date(2026, 10, 17, 10, 15))).toMatchObject({ m: { room: 'MC 2065' }, now: true });
    // Tuesday 11:30: next is Wednesday 8:30 MATH 135.
    const n = nextClass(ms, new Date(2026, 10, 17, 11, 30))!;
    expect(n.m.room).toBe('DC 1351'); expect(n.at.getDate()).toBe(18); expect(n.now).toBe(false);
    // After the term: nothing.
    expect(nextClass(ms, new Date(2026, 11, 20, 9, 0))).toBeNull();
  });
});

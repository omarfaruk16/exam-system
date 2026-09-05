import type { ImportRowError } from '@exam/types';
import { pick } from './import-file';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CODE_RE = /^[A-Za-z0-9._-]{1,30}$/u;

type Result<T> = { value?: T; error?: ImportRowError };

// ─────────────────────────────── Teachers ───────────────────────────────
// Teachers sign in with their email, so email is the required identifier — no username column.
export interface ParsedTeacherRow {
  rowNumber: number;
  name: string;
  email: string;
  departmentName: string;
  designation: string | null;
  phone: string | null;
}

export function validateTeacherRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedTeacherRow> {
  const firstName = pick(cells, 'firstname', 'first name', 'first_name');
  const lastName = pick(cells, 'lastname', 'last name', 'last_name');
  const name =
    pick(cells, 'name', 'fullname', 'full name', 'displayname', 'display name', 'display_name') ||
    [firstName, lastName].filter(Boolean).join(' ');
  const email = pick(cells, 'email', 'e-mail');
  const departmentName = pick(cells, 'department', 'departmentname', 'department name', 'dept');
  const designation = pick(cells, 'designation', 'title');
  const phone = pick(cells, 'phone', 'mobile', 'contact');

  if (!name)
    return { error: { row, field: 'name', message: 'First and last name (or name) are required' } };
  if (!email) return { error: { row, field: 'email', message: 'Email is required' } };
  if (!EMAIL_RE.test(email)) {
    return { error: { row, field: 'email', value: email, message: 'Invalid email address' } };
  }
  if (!departmentName) {
    return { error: { row, field: 'department', message: 'Department name is required' } };
  }

  return {
    value: {
      rowNumber: row,
      name,
      email,
      departmentName,
      designation: designation || null,
      phone: phone || null,
    },
  };
}

// ─────────────────────────────── Departments ───────────────────────────────
export interface ParsedDepartmentRow {
  rowNumber: number;
  name: string;
  facultyName: string;
}

export function validateDepartmentRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedDepartmentRow> {
  const name = pick(cells, 'name', 'department', 'department name');
  const facultyName = pick(cells, 'faculty', 'facultyname', 'faculty name');

  if (!name) return { error: { row, field: 'name', message: 'Name is required' } };
  if (!facultyName)
    return { error: { row, field: 'faculty', message: 'Faculty name is required' } };

  return { value: { rowNumber: row, name, facultyName } };
}

// ─────────────────────────────── Courses ───────────────────────────────
export interface ParsedCourseRow {
  rowNumber: number;
  code: string;
  name: string;
  credit: number;
  semesterId: number | null;
  semesterNumber: number | null;
  programName: string | null;
  batchName: string | null;
}

export function validateCourseRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedCourseRow> {
  const code = pick(cells, 'code', 'course code');
  const name = pick(cells, 'name', 'course name', 'title');
  const creditRaw = pick(cells, 'credit', 'credits', 'credithours', 'credit hours');
  const semesterIdRaw = pick(cells, 'semesterid', 'semester id');
  const semesterNumberRaw = pick(cells, 'semesternumber', 'semester number', 'semester');
  const programName = pick(cells, 'program', 'programname', 'program name');
  const batchName = pick(cells, 'batch', 'batchname', 'batch name');

  if (!code) return { error: { row, field: 'code', message: 'Code is required' } };
  if (!CODE_RE.test(code)) {
    return {
      error: {
        row,
        field: 'code',
        value: code,
        message: 'Code: letters, digits, . _ - (1–30 chars)',
      },
    };
  }
  if (!name) return { error: { row, field: 'name', message: 'Name is required' } };
  const credit = Number(creditRaw || '0');
  if (!creditRaw || !Number.isFinite(credit) || credit <= 0) {
    return {
      error: {
        row,
        field: 'credit',
        value: creditRaw,
        message: 'Credit must be a positive number',
      },
    };
  }

  const semesterId = semesterIdRaw ? Number(semesterIdRaw) : null;
  const semesterNumber = semesterNumberRaw ? Number(semesterNumberRaw) : null;
  if (!semesterIdRaw && !(semesterNumberRaw && programName && batchName)) {
    return {
      error: {
        row,
        field: 'semesterId',
        message: 'Provide semesterId, or semesterNumber with program and batch',
      },
    };
  }
  if (semesterIdRaw && !Number.isInteger(semesterId)) {
    return {
      error: {
        row,
        field: 'semesterId',
        value: semesterIdRaw,
        message: 'semesterId must be a number',
      },
    };
  }
  if (semesterNumberRaw && !Number.isInteger(semesterNumber)) {
    return {
      error: {
        row,
        field: 'semesterNumber',
        value: semesterNumberRaw,
        message: 'semesterNumber must be a number',
      },
    };
  }

  return {
    value: {
      rowNumber: row,
      code,
      name,
      credit,
      semesterId,
      semesterNumber,
      programName: programName || null,
      batchName: batchName || null,
    },
  };
}

// ─────────────────────────────── Faculties ───────────────────────────────
export interface ParsedFacultyRow {
  rowNumber: number;
  name: string;
}

export function validateFacultyRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedFacultyRow> {
  const name = pick(cells, 'name', 'faculty', 'faculty name', 'facultyname');
  if (!name) return { error: { row, field: 'name', message: 'Faculty name is required' } };
  return { value: { rowNumber: row, name } };
}

// ─────────────────────────────── Semesters ───────────────────────────────
export interface ParsedSemesterRow {
  rowNumber: number;
  programName: string;
  batchName: string;
  number: number;
  name: string | null;
}

export function validateSemesterRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedSemesterRow> {
  const programName = pick(cells, 'program', 'programname', 'program name');
  const batchName = pick(cells, 'batch', 'batchname', 'batch name');
  const numberRaw = pick(cells, 'number', 'semesternumber', 'semester number', 'semester');
  const name = pick(cells, 'name', 'semestername', 'semester name');

  if (!programName)
    return { error: { row, field: 'program', message: 'Program name is required' } };
  if (!batchName) return { error: { row, field: 'batch', message: 'Batch name is required' } };
  const number = Number(numberRaw || '0');
  if (!numberRaw || !Number.isInteger(number) || number <= 0) {
    return {
      error: {
        row,
        field: 'number',
        value: numberRaw,
        message: 'Semester number must be a positive whole number',
      },
    };
  }
  return { value: { rowNumber: row, programName, batchName, number, name: name || null } };
}

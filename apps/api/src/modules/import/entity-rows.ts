import type { ImportRowError } from '@exam/types';
import { pick } from './import-file';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,50}$/u;
const CODE_RE = /^[A-Za-z0-9._-]{1,30}$/u;

type Result<T> = { value?: T; error?: ImportRowError };

// ─────────────────────────────── Teachers ───────────────────────────────
export interface ParsedTeacherRow {
  rowNumber: number;
  username: string;
  name: string;
  email: string | null;
  departmentName: string;
  designation: string | null;
  phone: string | null;
}

export function validateTeacherRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedTeacherRow> {
  const username = pick(cells, 'username', 'user name', 'login');
  const firstName = pick(cells, 'firstname', 'first name', 'first_name');
  const lastName = pick(cells, 'lastname', 'last name', 'last_name');
  const name =
    pick(cells, 'name', 'fullname', 'full name', 'displayname', 'display name', 'display_name') ||
    [firstName, lastName].filter(Boolean).join(' ');
  const email = pick(cells, 'email', 'e-mail');
  const departmentName = pick(cells, 'department', 'departmentname', 'department name', 'dept');
  const designation = pick(cells, 'designation', 'title');
  const phone = pick(cells, 'phone', 'mobile', 'contact');

  if (!username) return { error: { row, field: 'username', message: 'Username is required' } };
  if (!USERNAME_RE.test(username)) {
    return {
      error: {
        row,
        field: 'username',
        value: username,
        message: 'Username: letters, digits, . _ - (3–50 chars)',
      },
    };
  }
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
      username,
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
  if (!semesterIdRaw && !(semesterNumberRaw && programName)) {
    return {
      error: {
        row,
        field: 'semesterId',
        message: 'Provide semesterId, or both semesterNumber and program',
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
    },
  };
}

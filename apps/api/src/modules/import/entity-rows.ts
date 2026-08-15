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
  departmentCode: string | null;
  departmentId: number | null;
  designation: string | null;
  phone: string | null;
}

export function validateTeacherRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedTeacherRow> {
  const username = pick(cells, 'username', 'user name', 'login');
  const firstName = pick(cells, 'firstname', 'first name');
  const lastName = pick(cells, 'lastname', 'last name');
  const name =
    pick(cells, 'name', 'fullname', 'full name') || [firstName, lastName].filter(Boolean).join(' ');
  const email = pick(cells, 'email', 'e-mail');
  const departmentCode = pick(cells, 'departmentcode', 'department code', 'dept', 'department');
  const departmentIdRaw = pick(cells, 'departmentid', 'department id');
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
  if (!departmentCode && !departmentIdRaw) {
    return {
      error: {
        row,
        field: 'departmentCode',
        message: 'departmentCode or departmentId is required',
      },
    };
  }
  const departmentId = departmentIdRaw ? Number(departmentIdRaw) : null;
  if (departmentIdRaw && !Number.isInteger(departmentId)) {
    return {
      error: {
        row,
        field: 'departmentId',
        value: departmentIdRaw,
        message: 'departmentId must be a number',
      },
    };
  }

  return {
    value: {
      rowNumber: row,
      username,
      name,
      email,
      departmentCode: departmentCode || null,
      departmentId,
      designation: designation || null,
      phone: phone || null,
    },
  };
}

// ─────────────────────────────── Departments ───────────────────────────────
export interface ParsedDepartmentRow {
  rowNumber: number;
  name: string;
  code: string;
  facultyCode: string | null;
  facultyId: number | null;
}

export function validateDepartmentRow(
  cells: Record<string, string>,
  row: number,
): Result<ParsedDepartmentRow> {
  const name = pick(cells, 'name', 'department', 'department name');
  const code = pick(cells, 'code', 'department code');
  const facultyCode = pick(cells, 'facultycode', 'faculty code', 'faculty');
  const facultyIdRaw = pick(cells, 'facultyid', 'faculty id');

  if (!name) return { error: { row, field: 'name', message: 'Name is required' } };
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
  if (!facultyCode && !facultyIdRaw) {
    return {
      error: { row, field: 'facultyCode', message: 'facultyCode or facultyId is required' },
    };
  }
  const facultyId = facultyIdRaw ? Number(facultyIdRaw) : null;
  if (facultyIdRaw && !Number.isInteger(facultyId)) {
    return {
      error: {
        row,
        field: 'facultyId',
        value: facultyIdRaw,
        message: 'facultyId must be a number',
      },
    };
  }

  return { value: { rowNumber: row, name, code, facultyCode: facultyCode || null, facultyId } };
}

// ─────────────────────────────── Courses ───────────────────────────────
export interface ParsedCourseRow {
  rowNumber: number;
  code: string;
  name: string;
  credit: number;
  semesterId: number | null;
  semesterNumber: number | null;
  programCode: string | null;
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
  const programCode = pick(cells, 'programcode', 'program code', 'program');

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
  if (!semesterIdRaw && !(semesterNumberRaw && programCode)) {
    return {
      error: {
        row,
        field: 'semesterId',
        message: 'Provide semesterId, or both semesterNumber and programCode',
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
      programCode: programCode || null,
    },
  };
}

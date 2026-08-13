import type { ImportRowError } from '@exam/types';

export interface ParsedStudentRow {
  rowNumber: number;
  studentId: string;
  name: string;
  email: string | null;
  /** Optional password from the sheet; when absent the worker generates a temporary one. */
  password: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const STUDENT_ID_RE = /^[A-Za-z0-9._-]{2,50}$/u;

function cell(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/**
 * Pure, unit-testable validation of one imported student row. Header keys are matched
 * case-insensitively by the caller (lower-cased). Returns either a parsed row or a row error.
 */
export function validateStudentRow(
  raw: Record<string, unknown>,
  rowNumber: number,
): { value?: ParsedStudentRow; error?: ImportRowError } {
  const studentId = cell(raw, 'studentid', 'student id', 'id', 'roll');
  const name = cell(raw, 'name', 'fullname', 'full name', 'student name');
  const email = cell(raw, 'email', 'e-mail');
  const password = cell(raw, 'password', 'temppassword', 'temp password');

  if (!studentId) {
    return { error: { row: rowNumber, field: 'studentId', message: 'Student ID is required' } };
  }
  if (!STUDENT_ID_RE.test(studentId)) {
    return {
      error: {
        row: rowNumber,
        field: 'studentId',
        value: studentId,
        message: 'Student ID may only contain letters, digits, dot, dash, underscore (2–50 chars)',
      },
    };
  }
  if (!name) {
    return { error: { row: rowNumber, field: 'name', message: 'Name is required' } };
  }
  if (email && !EMAIL_RE.test(email)) {
    return {
      error: { row: rowNumber, field: 'email', value: email, message: 'Invalid email address' },
    };
  }
  if (password && password.length < 8) {
    return {
      error: {
        row: rowNumber,
        field: 'password',
        message: 'Password must be at least 8 characters',
      },
    };
  }

  return {
    value: { rowNumber, studentId, name, email: email || null, password: password || null },
  };
}

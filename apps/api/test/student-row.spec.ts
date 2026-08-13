import { describe, expect, it } from 'vitest';
import { validateStudentRow } from '../src/modules/import/student-row';

describe('validateStudentRow', () => {
  it('accepts a valid row', () => {
    const { value, error } = validateStudentRow(
      { studentid: '2021001', name: 'Ayesha', email: 'ayesha@x.com' },
      2,
    );
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      studentId: '2021001',
      name: 'Ayesha',
      email: 'ayesha@x.com',
      password: null,
    });
  });

  it('matches headers case-insensitively and trims whitespace', () => {
    const { value } = validateStudentRow({ 'student id': '  2021002 ', name: ' Tanvir ' }, 3);
    expect(value?.studentId).toBe('2021002');
    expect(value?.name).toBe('Tanvir');
  });

  it('rejects a missing student id', () => {
    expect(validateStudentRow({ name: 'x' }, 4).error?.field).toBe('studentId');
  });

  it('rejects invalid student-id characters', () => {
    expect(validateStudentRow({ studentid: 'has space', name: 'x' }, 5).error?.field).toBe(
      'studentId',
    );
  });

  it('rejects a missing name', () => {
    expect(validateStudentRow({ studentid: '2021003' }, 6).error?.field).toBe('name');
  });

  it('rejects an invalid email', () => {
    expect(
      validateStudentRow({ studentid: '2021004', name: 'x', email: 'bad' }, 7).error?.field,
    ).toBe('email');
  });

  it('rejects a too-short password', () => {
    expect(
      validateStudentRow({ studentid: '2021005', name: 'x', password: 'short' }, 8).error?.field,
    ).toBe('password');
  });
});

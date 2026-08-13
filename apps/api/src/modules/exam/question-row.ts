import type { ImportRowError } from '@exam/types';

export interface ParsedMcqRow {
  type: 'mcq';
  text: string;
  marks: number;
  explanation: string | null;
  options: { text: string; isCorrect: boolean; order: number }[];
}
export interface ParsedWrittenRow {
  type: 'written';
  text: string;
  marks: number;
  modelAnswer: string | null;
}

function cell(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseMarks(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Validate one row of the "MCQ" sheet. Columns: question, marks, optionA..E, correct, explanation. */
export function validateMcqRow(
  raw: Record<string, unknown>,
  rowNumber: number,
): { value?: ParsedMcqRow; error?: ImportRowError } {
  const text = cell(raw, 'question', 'text');
  if (!text)
    return { error: { row: rowNumber, field: 'question', message: 'Question text is required' } };

  const marks = parseMarks(cell(raw, 'marks', 'mark'));
  if (marks === null) {
    return { error: { row: rowNumber, field: 'marks', message: 'Marks must be a number ≥ 0' } };
  }

  const optionTexts = LETTERS.map((L) =>
    cell(raw, `option${L.toLowerCase()}`, `option ${L.toLowerCase()}`, L.toLowerCase()),
  ).map((t, i) => ({ text: t, letter: LETTERS[i]!, order: i }));
  const present = optionTexts.filter((o) => o.text);
  if (present.length < 2) {
    return {
      error: {
        row: rowNumber,
        field: 'options',
        message: 'Provide at least two options (optionA, optionB, …)',
      },
    };
  }

  const correct = cell(raw, 'correct', 'answer', 'correct option').toUpperCase();
  if (!LETTERS.includes(correct)) {
    return {
      error: {
        row: rowNumber,
        field: 'correct',
        value: correct,
        message: 'Correct must be a letter A–E',
      },
    };
  }
  if (!present.some((o) => o.letter === correct)) {
    return {
      error: {
        row: rowNumber,
        field: 'correct',
        value: correct,
        message: 'Correct letter has no matching option',
      },
    };
  }

  return {
    value: {
      type: 'mcq',
      text,
      marks,
      explanation: cell(raw, 'explanation') || null,
      options: present.map((o) => ({
        text: o.text,
        isCorrect: o.letter === correct,
        order: o.order,
      })),
    },
  };
}

/** Validate one row of the "Written" sheet. Columns: question, marks, modelAnswer. */
export function validateWrittenRow(
  raw: Record<string, unknown>,
  rowNumber: number,
): { value?: ParsedWrittenRow; error?: ImportRowError } {
  const text = cell(raw, 'question', 'text');
  if (!text)
    return { error: { row: rowNumber, field: 'question', message: 'Question text is required' } };

  const marks = parseMarks(cell(raw, 'marks', 'mark'));
  if (marks === null) {
    return { error: { row: rowNumber, field: 'marks', message: 'Marks must be a number ≥ 0' } };
  }

  return {
    value: {
      type: 'written',
      text,
      marks,
      modelAnswer: cell(raw, 'modelanswer', 'model answer', 'answer') || null,
    },
  };
}

import { describe, expect, it } from 'vitest';
import { validateMcqRow, validateWrittenRow } from '../src/modules/exam/question-row';

describe('validateMcqRow', () => {
  it('accepts a valid MCQ and marks exactly the correct option', () => {
    const { value, error } = validateMcqRow(
      { question: 'Q?', marks: '2', optiona: 'yes', optionb: 'no', correct: 'a', explanation: 'x' },
      2,
    );
    expect(error).toBeUndefined();
    expect(value?.marks).toBe(2);
    expect(value?.options.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(value?.options.find((o) => o.isCorrect)?.text).toBe('yes');
  });

  it('rejects fewer than two options', () => {
    expect(
      validateMcqRow({ question: 'Q', marks: '1', optiona: 'only', correct: 'A' }, 3).error?.field,
    ).toBe('options');
  });

  it('rejects a correct letter with no matching option', () => {
    expect(
      validateMcqRow({ question: 'Q', marks: '1', optiona: 'a', optionb: 'b', correct: 'D' }, 4)
        .error?.field,
    ).toBe('correct');
  });

  it('rejects non-numeric marks', () => {
    expect(
      validateMcqRow({ question: 'Q', marks: 'x', optiona: 'a', optionb: 'b', correct: 'A' }, 5)
        .error?.field,
    ).toBe('marks');
  });
});

describe('validateWrittenRow', () => {
  it('accepts a valid written row', () => {
    const { value, error } = validateWrittenRow(
      { question: 'Explain X', marks: '5', modelanswer: 'because' },
      2,
    );
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ type: 'written', marks: 5, modelAnswer: 'because' });
  });

  it('rejects a missing question', () => {
    expect(validateWrittenRow({ marks: '5' }, 3).error?.field).toBe('question');
  });
});

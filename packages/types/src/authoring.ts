/** Teacher exam-authoring surfaces (list, metadata form, question builder). */

export interface ExamSettings {
  showMarksAfterSubmit: boolean;
  showExplanation: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  negativeMarkValue: number;
}

/** One card in the authoring exam list. */
export interface ExamListItem {
  publicId: string;
  title: string;
  courseCode: string;
  part: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  totalMarks: number;
  questionCount: number;
  status: string;
  reviewNote: string | null;
  createdByName: string;
}

/** Full exam as returned by GET /exams/:id — pre-fills the metadata form and the builder header. */
export interface ExamDetail {
  publicId: string;
  title: string;
  instructions: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  totalMarks: number;
  status: string;
  settings: ExamSettings;
  reviewNote: string | null;
  publishedAt: string | null;
  offeringPart: {
    publicId: string;
    coursePart: { publicId: string; name: string };
  };
  createdBy: { publicId: string; user: { displayName: string } };
}

/** A question attached to an exam (right panel of the builder). */
export interface ExamQuestionItem {
  publicId: string;
  order: number;
  marksOverride: number | null;
  snapshotAt: string | null;
  snapshotType: string | null;
  snapshotText: string | null;
  snapshotMarks: number | null;
  snapshotExplanation: string | null;
  snapshotOptions: unknown;
  question: {
    publicId: string;
    type: 'mcq' | 'written';
    text: string;
    marks: number;
  };
}

/** A question bank for an offering part. */
export interface QuestionBankSummary {
  publicId: string;
  name: string;
  createdAt: string;
  offeringPart: { publicId: string };
}

export interface BankQuestionOption {
  publicId: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

/** A question in the bank (authoring view — includes the correct answer; never sent to students). */
export interface BankQuestion {
  publicId: string;
  type: 'mcq' | 'written';
  text: string;
  marks: number;
  explanation: string | null;
  modelAnswer: string | null;
  bank: { publicId: string };
  options: BankQuestionOption[];
}

/** An offering part the current teacher is assigned to — for the New Exam / bank pickers. */
export interface OfferingPartOption {
  publicId: string;
  partName: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  label: string;
}

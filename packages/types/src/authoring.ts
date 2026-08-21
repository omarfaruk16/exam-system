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
  updatedAt: string;
  createdByName: string;
}

/** One student's row in the per-exam review roster (GET /exams/:id/results). */
export interface ExamResultRow {
  studentPublicId: string;
  studentId: string;
  rollNumber: string | null;
  name: string;
  batchName: string;
  attempted: boolean;
  attemptStatus: string | null;
  gradingStatus: string | null;
  submittedAt: string | null;
  attemptPublicId: string | null;
  score: number | null;
  percentage: number | null;
  rank: number | null;
}

/** Per-exam review portal payload: exam header + every enrolled student's attendance and mark. */
export interface ExamResultsOverview {
  exam: {
    publicId: string;
    title: string;
    courseCode: string;
    courseName: string;
    partName: string;
    semesterNumber: number;
    totalMarks: number;
    startAt: string;
    status: string;
  };
  counts: { total: number; attempted: number; absent: number };
  rows: ExamResultRow[];
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
  coursePart: {
    publicId: string;
    name: string;
    course: { publicId: string; code: string; name: string };
  };
  createdBy: { publicId: string; user: { displayName: string } };
}

/** A question attached to an exam (builder right panel + admin review detail). */
export interface ExamQuestionItem {
  publicId: string;
  order: number;
  marksOverride: number | null;
  snapshotAt: string | null;
  snapshotType: string | null;
  snapshotText: string | null;
  snapshotMarks: number | null;
  snapshotExplanation: string | null;
  snapshotModelAnswer: string | null;
  snapshotOptions: unknown;
  snapshotCorrectOptionId: string | null;
  question: {
    publicId: string;
    type: 'mcq' | 'written';
    text: string;
    marks: number;
    explanation: string | null;
    modelAnswer: string | null;
    // Authoring/review view only — carries the correct answer; never sent to students.
    options: { publicId: string; text: string; isCorrect: boolean; order: number }[];
  };
}

/** One enrolled student for the individual mark-sheet selector. */
export interface RosterStudent {
  publicId: string;
  studentId: string;
  name: string;
}

/** Report job status (GET /reports/:jobId). */
export interface ReportJobStatus {
  status: 'pending' | 'ready' | 'failed';
  downloads?: { excel: string; pdf: string };
  message?: string;
}

/** A question bank for a course part. */
export interface QuestionBankSummary {
  publicId: string;
  name: string;
  createdAt: string;
  coursePart: { publicId: string };
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

/** Department-level question bank overview: one row per course part. */
export interface DeptBankRow {
  courseCode: string;
  courseName: string;
  semesterLabel: string;
  partPublicId: string;
  partName: string;
  bankCount: number;
  questionCount: number;
}

/** A course part the current teacher is assigned to — for the New Exam / bank pickers. */
export interface PartOption {
  publicId: string;
  partName: string;
  courseCode: string;
  courseTitle: string;
  label: string;
}

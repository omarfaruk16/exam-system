/** Shared response shapes for the exam-taking + results surfaces (used by the web SPA). */

export interface PaperOption {
  id: string;
  text: string;
}
export interface PaperQuestion {
  questionPublicId: string;
  order: number;
  type: 'mcq' | 'written';
  text: string;
  marks: number;
  options?: PaperOption[]; // MCQ only — never carries the correct answer
}
export interface ExamPaper {
  examPublicId: string;
  title: string;
  instructions: string | null;
  durationMinutes: number;
  totalMarks: number;
  questions: PaperQuestion[];
}

export interface SavedAnswer {
  questionPublicId: string;
  selectedOptionId: string | null;
  writtenText: string | null;
}

export interface StartAttemptResponse {
  attempt: {
    publicId: string;
    startedAt: string;
    deadline: string;
    durationMinutes: number;
    status: string;
  };
  sessionId: string;
  serverTime: string;
  paper: ExamPaper;
  /** Answers already persisted for this attempt — lets a reconnect resume where the student left off. */
  savedAnswers: SavedAnswer[];
}

export interface AutosaveResponse {
  saved: number;
  serverTime: string;
}

export interface SubmitResult {
  attemptPublicId: string;
  status: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

export interface ServerTime {
  serverTime: string;
}

export interface MyExamListItem {
  examPublicId: string;
  title: string;
  courseCode: string;
  part: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  totalMarks: number;
  status: string;
  showMarksAfterSubmit: boolean;
  attempt: {
    publicId: string;
    status: string;
    gradingStatus: string;
    totalScore: number | null;
    submittedAt: string | null;
  } | null;
}

export interface SnapshotOption {
  id: string;
  text: string;
  order: number;
}

export interface AttemptResultQuestion {
  questionPublicId: string;
  order: number;
  type: string;
  snapshotText: string | null;
  snapshotOptions: SnapshotOption[] | null;
  marks: number | null;
  score: number | null;
  selectedOptionId: string | null;
  writtenText: string | null;
  correctOptionId: string | null;
  explanation: string | null;
  feedback: string | null;
}

export interface StudentExamResult {
  attemptPublicId: string;
  examPublicId: string;
  title: string;
  courseCode: string;
  courseName: string;
  partName: string;
  totalMarks: number;
  startAt: string;
  examStatus: string;
  gradingStatus: string | null;
  submittedAt: string | null;
  score: number | null;
  percentage: number | null;
  rank: number | null;
  showMarks: boolean;
}

export interface StudentSemesterResult {
  semester: { number: number; name: string | null };
  programName: string;
  exams: StudentExamResult[];
}

/** Returned by GET /attempts/:id/result. showMarks=false → Mode B (no breakdown). */
export interface AttemptResult {
  attemptPublicId: string;
  status: string;
  gradingStatus: string;
  autoSubmitted: boolean;
  submittedAt: string | null;
  showMarks: boolean;
  // Only present when showMarks = true
  examPublicId?: string;
  totalScore?: number | null;
  totalMarks?: number;
  percentage?: number | null;
  rank?: number | null;
  totalStudents?: number;
  myStudentPublicId?: string | null;
  questions?: AttemptResultQuestion[];
}

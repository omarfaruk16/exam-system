/** Teacher written-grading surfaces. */

export interface ExamToGrade {
  examPublicId: string;
  title: string;
  courseCode: string;
  part: string;
  status: string;
  pendingCount: number;
}

export interface PendingWrittenAnswer {
  answerPublicId: string;
  studentId: string;
  studentName: string;
  attemptPublicId: string;
  writtenText: string | null;
}

export interface PendingWrittenGroup {
  questionPublicId: string;
  text: string | null;
  maxMarks: number | null;
  pending: PendingWrittenAnswer[];
}

export interface GradeAnswerResult {
  answerPublicId: string;
  manualScore: number;
  isGraded: boolean;
}

/** Student self-service: academic history / transcript. */

export interface TranscriptExam {
  publicId: string;
  title: string;
  part: string;
  date: string; // ISO
  status: string;
  totalMarks: number;
  score: number | null; // null until marks are released
  percentage: number | null;
  rank: number | null;
  attended: boolean;
}

export interface TranscriptCourse {
  code: string;
  name: string;
  exams: TranscriptExam[];
}

export interface TranscriptSemester {
  number: number;
  label: string;
  courses: TranscriptCourse[];
}

export interface StudentTranscript {
  enrolled: boolean;
  student: {
    name: string;
    studentId: string;
    rollNumber: string | null;
    registrationNumber: string | null;
  } | null;
  program: {
    name: string;
    department: string;
    faculty: string;
    batch: string;
    year: number;
  } | null;
  semesters: TranscriptSemester[];
}

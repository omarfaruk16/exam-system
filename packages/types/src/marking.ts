/** Final marking & course-part rollup (teacher "send final report" + admin marking sheet). */

/** One student's rolled-up result for a single course part (aggregated over its exams). */
export interface CoursePartResultRow {
  studentPublicId: string;
  studentId: string;
  name: string;
  rollNumber: string | null;
  examsCounted: number;
  examsTotal: number;
  averageAll: number | null; // mean % across all counted exams
  bestOne: number | null; // best single exam %
  bestTwoAverage: number | null; // mean of the top two exam %s
}

/** A teacher's preview/summary of one course part's rollup, plus finalized state. */
export interface CoursePartSummary {
  part: {
    publicId: string;
    courseCode: string;
    courseName: string;
    partName: string;
    semesterLabel: string;
    batch: string | null;
  };
  exams: { publicId: string; title: string; date: string; totalMarks: number }[];
  rows: CoursePartResultRow[];
  finalized: boolean;
  finalizedAt: string | null;
}

/** Which aggregate the admin marking matrix shows in each cell. */
export type MarkingMetric = 'averageAll' | 'bestOne' | 'bestTwoAverage';

/** Cascading filter selections for the admin final-marking page (all optional). */
export interface MarkingFilters {
  faculty?: string;
  department?: string;
  program?: string;
  batch?: string;
  semester?: string;
  course?: string;
}

/** One option in a cascading selector. */
export interface FilterOption {
  publicId: string;
  label: string;
}

/** Options for every selector, narrowed by the current selection above it. */
export interface MarkingFilterOptions {
  faculties: FilterOption[];
  departments: FilterOption[];
  programs: FilterOption[];
  batches: FilterOption[];
  semesters: FilterOption[];
  courses: FilterOption[];
}

/** A course-part column in the admin marking matrix. */
export interface MarkingColumn {
  partPublicId: string;
  courseCode: string;
  courseName: string;
  partName: string;
  semesterLabel: string;
  finalized: boolean;
}

/** One student row in the admin marking matrix. */
export interface MarkingMatrixRow {
  studentPublicId: string;
  studentId: string;
  name: string;
  rollNumber: string | null;
  batch: string;
  program: string;
  /** partPublicId → the three aggregates for that part (null if no rollup). */
  cells: Record<
    string,
    { averageAll: number | null; bestOne: number | null; bestTwoAverage: number | null } | null
  >;
  /** Mean of the chosen metric across the student's parts (overall standing). */
  overall: number | null;
}

/** The admin final-marking matrix: parts (columns) × students (rows). */
export interface MarkingMatrix {
  columns: MarkingColumn[];
  rows: MarkingMatrixRow[];
  /** Count of columns not yet finalized by their teacher (informational). */
  pendingColumns: number;
}

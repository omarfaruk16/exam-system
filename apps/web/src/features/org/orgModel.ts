import type { Course, CoursePart, Department, Faculty, Program, Semester } from '@exam/types';
import {
  fetchCourseParts,
  fetchCourses,
  fetchDepartments,
  fetchPrograms,
  fetchSemesters,
} from './orgApi';

// The structure tree. Batches are a separate axis (assigned to semesters), managed elsewhere.
export type OrgLevel = 'faculty' | 'department' | 'program' | 'semester' | 'course' | 'part';

export type OrgNode =
  | { level: 'faculty'; publicId: string; raw: Faculty }
  | { level: 'department'; publicId: string; raw: Department }
  | { level: 'program'; publicId: string; raw: Program }
  | { level: 'semester'; publicId: string; raw: Semester }
  | { level: 'course'; publicId: string; raw: Course }
  | { level: 'part'; publicId: string; raw: CoursePart };

export const LEVEL_LABEL: Record<OrgLevel, string> = {
  faculty: 'Faculty',
  department: 'Department',
  program: 'Program',
  semester: 'Semester',
  course: 'Course',
  part: 'Course part',
};

/** Human display name for a node. */
export function nodeName(n: OrgNode): string {
  switch (n.level) {
    case 'faculty':
      return n.raw.name;
    case 'department':
      return n.raw.name;
    case 'program':
      return n.raw.name;
    case 'semester':
      return n.raw.name ?? `Semester ${n.raw.number}`;
    case 'course':
      return `${n.raw.code} — ${n.raw.name}`;
    case 'part':
      return n.raw.name;
  }
}

/** Count badge text, or null if the node has no child collection worth showing. */
export function nodeBadge(n: OrgNode): string | null {
  switch (n.level) {
    case 'faculty':
      return plural(n.raw._count.departments, 'department');
    case 'department':
      return plural(n.raw._count.programs, 'program');
    case 'program':
      return plural(n.raw._count.semesters, 'semester');
    case 'semester':
      return plural(n.raw._count.courses, 'course');
    case 'course':
      return plural(n.raw._count.parts, 'part');
    case 'part':
      return n.raw.assignedTeacher ? n.raw.assignedTeacher.user.displayName : 'No teacher';
  }
}

/** Whether a node can be expanded to reveal children. */
export function nodeExpandable(n: OrgNode): boolean {
  switch (n.level) {
    case 'faculty':
      return n.raw._count.departments > 0;
    case 'department':
      return n.raw._count.programs > 0;
    case 'program':
      return n.raw._count.semesters > 0;
    case 'semester':
      return n.raw._count.courses > 0;
    case 'course':
      return n.raw._count.parts > 0;
    case 'part':
      return false;
  }
}

/** Load a node's children as typed nodes. Programs fan out to batches then semesters. */
export async function loadChildren(n: OrgNode): Promise<OrgNode[]> {
  switch (n.level) {
    case 'faculty': {
      const rows = await fetchDepartments(n.publicId);
      return rows.map((raw) => ({ level: 'department', publicId: raw.publicId, raw }));
    }
    case 'department': {
      const rows = await fetchPrograms(n.publicId);
      return rows.map((raw) => ({ level: 'program', publicId: raw.publicId, raw }));
    }
    case 'program': {
      const rows = await fetchSemesters(n.publicId);
      return rows.map((raw) => ({ level: 'semester', publicId: raw.publicId, raw }));
    }
    case 'semester': {
      const rows = await fetchCourses(n.publicId);
      return rows.map((raw) => ({ level: 'course', publicId: raw.publicId, raw }));
    }
    case 'course': {
      const rows = await fetchCourseParts(n.publicId);
      return rows.map((raw) => ({ level: 'part', publicId: raw.publicId, raw }));
    }
    case 'part':
      return [];
  }
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

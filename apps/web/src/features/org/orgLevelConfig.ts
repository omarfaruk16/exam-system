import {
  createCourse,
  createCoursePart,
  createDepartment,
  createProgram,
  createSemester,
  deleteCourse,
  deleteCoursePart,
  deleteDepartment,
  deleteFaculty,
  deleteProgram,
  deleteSemester,
  updateCourse,
  updateCoursePart,
  updateDepartment,
  updateFaculty,
  updateProgram,
} from './orgApi';
import type { OrgLevel, OrgNode } from './orgModel';

export interface FieldDef {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'degree';
}

export const DEGREE_TYPES = ['bachelor', 'masters', 'mphil', 'phd', 'diploma'];

/** A child level that can be created under a given node, plus its create form fields. */
export interface AddChildDef {
  level: OrgLevel;
  label: string;
  fields: FieldDef[];
  create: (parentPublicId: string, body: Record<string, unknown>) => Promise<unknown>;
}

export interface LevelConfig {
  fields: FieldDef[];
  editable: boolean;
  update?: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  addChildren: AddChildDef[];
}

const DEPT: AddChildDef = {
  level: 'department',
  label: 'Add Department',
  fields: [{ key: 'name', label: 'Name', kind: 'text' }],
  create: (parent, b) =>
    createDepartment({ facultyPublicId: parent, ...b } as Parameters<typeof createDepartment>[0]),
};

const PROGRAM: AddChildDef = {
  level: 'program',
  label: 'Add Program',
  fields: [
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'degreeType', label: 'Degree type', kind: 'degree' },
    { key: 'durationYears', label: 'Duration (years)', kind: 'number' },
  ],
  create: (parent, b) =>
    createProgram({ departmentPublicId: parent, ...b } as Parameters<typeof createProgram>[0]),
};

const SEMESTER: AddChildDef = {
  level: 'semester',
  label: 'Add Semester',
  fields: [{ key: 'number', label: 'Semester number', kind: 'number' }],
  create: (parent, b) =>
    createSemester({ programPublicId: parent, ...b } as Parameters<typeof createSemester>[0]),
};

const COURSE: AddChildDef = {
  level: 'course',
  label: 'Add Course',
  fields: [
    { key: 'code', label: 'Code', kind: 'text' },
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'credit', label: 'Credit', kind: 'number' },
  ],
  create: (parent, b) =>
    createCourse({ semesterPublicId: parent, ...b } as Parameters<typeof createCourse>[0]),
};

const PART: AddChildDef = {
  level: 'part',
  label: 'Add Course part',
  fields: [
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'marksWeight', label: 'Marks weight', kind: 'number' },
  ],
  create: (parent, b) =>
    createCoursePart({ coursePublicId: parent, ...b } as Parameters<typeof createCoursePart>[0]),
};

export const LEVEL_CONFIG: Record<OrgLevel, LevelConfig> = {
  faculty: {
    fields: [{ key: 'name', label: 'Name', kind: 'text' }],
    editable: true,
    update: (id, b) => updateFaculty(id, b as never),
    remove: deleteFaculty,
    addChildren: [DEPT],
  },
  department: {
    fields: [{ key: 'name', label: 'Name', kind: 'text' }],
    editable: true,
    update: (id, b) => updateDepartment(id, b as never),
    remove: deleteDepartment,
    addChildren: [PROGRAM],
  },
  program: {
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'degreeType', label: 'Degree type', kind: 'degree' },
      { key: 'durationYears', label: 'Duration (years)', kind: 'number' },
    ],
    editable: true,
    update: (id, b) => updateProgram(id, b as never),
    remove: deleteProgram,
    addChildren: [SEMESTER],
  },
  semester: {
    // No update route for semesters — number is fixed once created.
    fields: [{ key: 'number', label: 'Semester number', kind: 'number' }],
    editable: false,
    remove: deleteSemester,
    addChildren: [COURSE],
  },
  course: {
    fields: [
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'credit', label: 'Credit', kind: 'number' },
    ],
    editable: true,
    update: (id, b) => updateCourse(id, b as never),
    remove: deleteCourse,
    addChildren: [PART],
  },
  part: {
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'marksWeight', label: 'Marks weight', kind: 'number' },
    ],
    editable: true,
    update: (id, b) => updateCoursePart(id, b as never),
    remove: deleteCoursePart,
    addChildren: [],
  },
};

/** The `_count`-derived total of child rows, for the delete warning. */
export function childCountOf(n: OrgNode): { count: number; label: string } {
  switch (n.level) {
    case 'faculty':
      return { count: n.raw._count.departments, label: 'department' };
    case 'department':
      return { count: n.raw._count.programs, label: 'program' };
    case 'program':
      return { count: n.raw._count.semesters, label: 'semester' };
    case 'semester':
      return { count: n.raw._count.courses, label: 'course' };
    case 'course':
      return { count: n.raw._count.parts, label: 'part' };
    case 'part':
      return { count: n.raw._count.exams, label: 'exam' };
  }
}

/** Field values for the edit form, read off the node's raw entity. */
export function fieldValues(n: OrgNode): Record<string, string> {
  const raw = n.raw as unknown as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of LEVEL_CONFIG[n.level].fields) {
    const v = raw[f.key];
    out[f.key] = v != null ? String(v) : '';
  }
  return out;
}

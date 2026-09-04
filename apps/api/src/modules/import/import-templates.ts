import ExcelJS from 'exceljs';

type TemplateType = 'students' | 'teachers' | 'departments' | 'courses' | 'faculties' | 'semesters';

export type TemplateFormat = 'xlsx' | 'csv';

interface TemplateSpec {
  headers: string[];
  example: (string | number)[];
}

const TEMPLATES: Record<TemplateType, TemplateSpec> = {
  students: {
    headers: ['studentId', 'name', 'email', 'registrationNumber', 'rollNumber', 'phone'],
    example: [
      '2021099',
      'Ayesha Rahman',
      'ayesha99@student.example.edu',
      'RU-2021-CSE-099',
      '01',
      '01700000000',
    ],
  },
  teachers: {
    headers: ['username', 'name', 'email', 'department', 'designation', 'phone'],
    example: [
      'jdoe',
      'Dr. John Doe',
      'jdoe@example.edu',
      'Computer Science & Engineering',
      'Lecturer',
      '01700000000',
    ],
  },
  faculties: {
    headers: ['name'],
    example: ['Faculty of Engineering'],
  },
  departments: {
    headers: ['name', 'faculty'],
    example: ['Software Engineering', 'Faculty of Science'],
  },
  semesters: {
    headers: ['program', 'batch', 'number', 'name'],
    example: ['Honours', '2021 Batch', 3, 'Third Semester'],
  },
  courses: {
    headers: ['code', 'name', 'credit', 'semesterId', 'semesterNumber', 'program', 'batch'],
    example: ['CSE-2101', 'Data Structures', 3, '', 2, 'Honours', '2021 Batch'],
  },
};

const TEMPLATE_TYPES = Object.keys(TEMPLATES) as TemplateType[];

export function isTemplateType(t: string): t is TemplateType {
  return (TEMPLATE_TYPES as string[]).includes(t);
}

/** Build a pre-formatted .xlsx template (bold headers + one example row) as a Buffer. */
export async function buildTemplate(type: TemplateType): Promise<Buffer> {
  const spec = TEMPLATES[type];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(type);
  ws.columns = spec.headers.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(spec.example);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** Build a CSV template (header row + one example row) as a Buffer. */
export function buildTemplateCsv(type: TemplateType): Buffer {
  const spec = TEMPLATES[type];
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [spec.headers.map(esc).join(','), spec.example.map(esc).join(',')].join('\r\n');
  return Buffer.from(String.fromCharCode(0xfeff) + csv, 'utf8'); // UTF-8 BOM so Excel opens it with the right encoding
}

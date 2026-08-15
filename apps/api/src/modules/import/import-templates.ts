import ExcelJS from 'exceljs';

type TemplateType = 'students' | 'teachers' | 'departments' | 'courses';

interface TemplateSpec {
  headers: string[];
  example: (string | number)[];
}

const TEMPLATES: Record<TemplateType, TemplateSpec> = {
  students: {
    headers: ['studentId', 'firstName', 'lastName', 'email', 'batchId', 'phone'],
    example: ['2021099', 'Ayesha', 'Rahman', 'ayesha99@student.example.edu', 1, '01700000000'],
  },
  teachers: {
    headers: [
      'username',
      'firstName',
      'lastName',
      'email',
      'departmentCode',
      'designation',
      'phone',
    ],
    example: ['jdoe', 'John', 'Doe', 'jdoe@example.edu', 'CSE', 'Lecturer', '01700000000'],
  },
  departments: {
    headers: ['name', 'code', 'facultyCode'],
    example: ['Software Engineering', 'SWE', 'SCI'],
  },
  courses: {
    headers: ['code', 'name', 'credit', 'semesterId', 'semesterNumber', 'programCode'],
    example: ['CSE-2101', 'Data Structures', 3, '', 2, 'BSc in Computer Science & Engineering'],
  },
};

export function isTemplateType(t: string): t is TemplateType {
  return t === 'students' || t === 'teachers' || t === 'departments' || t === 'courses';
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

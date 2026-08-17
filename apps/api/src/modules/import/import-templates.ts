import ExcelJS from 'exceljs';

type TemplateType = 'students' | 'teachers' | 'departments' | 'courses';

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
  departments: {
    headers: ['name', 'faculty'],
    example: ['Software Engineering', 'Faculty of Science'],
  },
  courses: {
    headers: ['code', 'name', 'credit', 'semesterId', 'semesterNumber', 'program'],
    example: ['CSE-2101', 'Data Structures', 3, '', 2, 'Honours'],
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

/** Generates a question-import workbook (MCQ + Written sheets) with valid and invalid rows. */
import ExcelJS from 'exceljs';

async function main(): Promise<void> {
  const out = process.argv[2] ?? '/tmp/qimport.xlsx';
  const wb = new ExcelJS.Workbook();

  const mcq = wb.addWorksheet('MCQ');
  mcq.addRow(['question', 'marks', 'optionA', 'optionB', 'optionC', 'correct', 'explanation']);
  mcq.addRow([
    'Capital of Bangladesh?',
    2,
    'Dhaka',
    'Delhi',
    'Kolkata',
    'A',
    'Dhaka is the capital',
  ]);
  mcq.addRow(['2 * 3 = ?', 1, '5', '6', '7', 'B', '']);
  mcq.addRow(['Invalid: correct letter with no option', 1, 'x', 'y', '', 'Z', '']); // rejected

  const written = wb.addWorksheet('Written');
  written.addRow(['question', 'marks', 'modelAnswer']);
  written.addRow([
    'Explain object-oriented programming.',
    5,
    'Encapsulation, inheritance, polymorphism.',
  ]);
  written.addRow(['', 3, 'Invalid: missing question']); // rejected

  await wb.xlsx.writeFile(out);

  console.log(`wrote ${out}`);
}

void main();

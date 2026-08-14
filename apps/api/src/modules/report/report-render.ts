import ExcelJS from 'exceljs';
import { createWriteStream } from 'node:fs';
import PDFDocument from 'pdfkit';
import type { IndividualData, OverallData } from './report-data.service';

function pad(s: string | number, n: number): string {
  const str = String(s);
  return str.length >= n ? str.slice(0, n - 1) + ' ' : str.padEnd(n, ' ');
}

function finishPdf(doc: PDFKit.PDFDocument, stream: import('node:fs').WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.end();
  });
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

// ─────────────────────────────── Overall ───────────────────────────────
export async function writeOverallExcel(data: OverallData, path: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Overall');
  ws.columns = [
    { header: 'Student ID', key: 'sid', width: 14 },
    { header: 'Name', key: 'name', width: 28 },
    ...data.questions.map((q) => ({
      header: `${q.label} (${q.maxMarks})`,
      key: q.questionPublicId,
      width: 10,
    })),
    { header: 'Total', key: 'total', width: 10 },
    { header: '%', key: 'pct', width: 8 },
    { header: 'Rank', key: 'rank', width: 8 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of data.rows) {
    const row: Record<string, unknown> = {
      sid: r.studentId,
      name: r.name,
      total: r.totalScore,
      pct: round1(r.percentage),
      rank: r.rank ?? '',
      status: r.status,
    };
    for (const q of data.questions) row[q.questionPublicId] = r.scores[q.questionPublicId] ?? 0;
    ws.addRow(row);
  }
  await wb.xlsx.writeFile(path);
}

export async function writeOverallPdf(data: OverallData, path: string): Promise<void> {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const stream = createWriteStream(path);
  doc.pipe(stream);

  doc.font('Helvetica-Bold').fontSize(16).text(`Overall Mark Sheet — ${data.exam.title}`);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#555')
    .text(
      `${data.exam.courseCode} · ${data.exam.batchName} · ${data.exam.termName} · Total ${data.exam.totalMarks}`,
    );
  doc.moveDown().fillColor('#000');

  doc.font('Courier-Bold').fontSize(9);
  doc.text(
    `${pad('ID', 11)}${pad('Name', 24)}${pad('Total', 7)}${pad('%', 6)}${pad('Rank', 6)}${pad('Status', 10)}Per-question`,
  );
  doc.font('Courier').moveDown(0.3);
  for (const r of data.rows) {
    const perQ = data.questions
      .map((q) => `${q.label}:${r.scores[q.questionPublicId] ?? 0}`)
      .join(' ');
    doc.text(
      `${pad(r.studentId, 11)}${pad(r.name, 24)}${pad(r.totalScore, 7)}${pad(Math.round(r.percentage), 6)}${pad(r.rank ?? '-', 6)}${pad(r.status, 10)}${perQ}`,
    );
  }
  await finishPdf(doc, stream);
}

// ─────────────────────────────── Individual ───────────────────────────────
export async function writeIndividualExcel(data: IndividualData, path: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mark Sheet');
  ws.addRow([data.exam.title]).font = { bold: true, size: 14 };
  ws.addRow([`${data.exam.courseCode} · Total ${data.exam.totalMarks}`]);
  ws.addRow([`Student: ${data.student.name} (${data.student.studentId})`]);
  ws.addRow([
    `Total: ${data.attempt.totalScore}/${data.exam.totalMarks} · ${round1(data.attempt.percentage)}% · Rank ${data.attempt.rank ?? '-'} · ${data.attempt.status}`,
  ]);
  ws.addRow([]);
  const header = ws.addRow([
    '#',
    'Type',
    'Question',
    'Your answer',
    'Score',
    'Max',
    'Feedback',
    'Explanation',
  ]);
  header.font = { bold: true };
  ws.columns = [
    { width: 4 },
    { width: 9 },
    { width: 40 },
    { width: 30 },
    { width: 8 },
    { width: 6 },
    { width: 28 },
    { width: 30 },
  ];
  for (const q of data.questions) {
    ws.addRow([
      q.order,
      q.type,
      q.text,
      q.studentAnswer,
      q.score,
      q.maxMarks,
      q.feedback ?? '',
      q.explanation ?? '',
    ]);
  }
  await wb.xlsx.writeFile(path);
}

export async function writeIndividualPdf(data: IndividualData, path: string): Promise<void> {
  const doc = new PDFDocument({ margin: 44, size: 'A4' });
  const stream = createWriteStream(path);
  doc.pipe(stream);

  doc.font('Helvetica-Bold').fontSize(16).text(data.exam.title);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#555')
    .text(`${data.exam.courseCode} · Total ${data.exam.totalMarks}`);
  doc
    .moveDown(0.4)
    .fillColor('#000')
    .fontSize(11)
    .text(`${data.student.name}  (${data.student.studentId})`);
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(
      `Total: ${data.attempt.totalScore} / ${data.exam.totalMarks}   ·   ${round1(data.attempt.percentage)}%   ·   Rank ${data.attempt.rank ?? '-'}   ·   ${data.attempt.status}`,
    );
  doc.moveDown(0.6).font('Helvetica');

  data.questions.forEach((q) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000')
      .text(`${q.order}. [${q.type}] ${q.text}`);
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(`Your answer: ${q.studentAnswer}`);
    doc.font('Helvetica-Bold').fillColor('#1E3A5F').text(`Score: ${q.score} / ${q.maxMarks}`);
    if (q.feedback) doc.font('Helvetica-Oblique').fillColor('#555').text(`Feedback: ${q.feedback}`);
    if (q.explanation)
      doc.font('Helvetica-Oblique').fillColor('#555').text(`Explanation: ${q.explanation}`);
    doc.moveDown(0.5);
  });

  await finishPdf(doc, stream);
}

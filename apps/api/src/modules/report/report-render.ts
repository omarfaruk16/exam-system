import ExcelJS from 'exceljs';
import { createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { IndividualData, OverallData, ReportHeader } from './report-data.service';

// ─────────────────────────── Shared constants ───────────────────────────
const BRAND = '#1E3A5F'; // University deep-blue
const INK = '#1a1a1a';
const MUTED = '#555555';
const RULE = '#c9ced6';
const ZEBRA = '#f4f6f9';

// A4 = 595.28 × 841.89 pt. Generous 54pt (~19mm) margins on every side.
const PAGE_MARGIN = 54;
const A4 = { width: 595.28, height: 841.89 };
const CONTENT_WIDTH = A4.width - PAGE_MARGIN * 2;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The logo is shipped in apps/api/assets and read relative to the process cwd (apps/api). */
function logoPath(): string | null {
  const p = join(process.cwd(), 'assets', 'ru-logo.png');
  return existsSync(p) ? p : null;
}

function finishPdf(doc: PDFKit.PDFDocument, stream: import('node:fs').WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.end();
  });
}

// ─────────────────────────── PDF letterhead ───────────────────────────

/**
 * Draws the shared University letterhead at the top of a report and returns the
 * Y coordinate just below it, so the caller can start the body there.
 */
function drawLetterhead(doc: PDFKit.PDFDocument, h: ReportHeader, docLabel: string): number {
  const left = PAGE_MARGIN;
  const right = A4.width - PAGE_MARGIN;
  let y = PAGE_MARGIN;

  // Logo — centered at the very top.
  const logo = logoPath();
  const logoSize = 58;
  if (logo) {
    try {
      doc.image(logo, (A4.width - logoSize) / 2, y, { width: logoSize, height: logoSize });
    } catch {
      /* if the image can't be decoded, skip it rather than fail the report */
    }
    y += logoSize + 6;
  }

  // Institution.
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(BRAND)
    .text(h.institution, left, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 2;

  // Department.
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(INK)
    .text(h.department, left, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 1;

  // Programme.
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(h.program, left, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 8;

  // Document label chip line (e.g. "CLASS RESULT SHEET").
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(BRAND)
    .text(docLabel.toUpperCase(), left, y, {
      width: CONTENT_WIDTH,
      align: 'center',
      characterSpacing: 1.5,
    });
  y = doc.y + 8;

  // Divider.
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(BRAND).stroke();
  y += 12;

  // ── Two-column meta grid: course facts | schedule facts ──
  const colGap = 24;
  const colW = (CONTENT_WIDTH - colGap) / 2;
  const rowH = 16;
  const labelW = 74;

  const drawField = (x: number, yy: number, label: string, value: string) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(label, x, yy, { width: labelW });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text(value, x + labelW, yy, { width: colW - labelW });
  };

  const leftFields: [string, string][] = [
    ['Course', `${h.courseName}`],
    ['Course code', h.courseCode],
    ['Part', h.partName],
    ['Semester', h.semester],
  ];
  const rightFields: [string, string][] = [
    ['Session', h.batch],
    ['Date', h.examDate],
    ['Duration', h.duration],
    ['Full marks', String(h.totalMarks)],
  ];

  const gridTop = y;
  leftFields.forEach(([l, v], i) => drawField(left, gridTop + i * rowH, l, v));
  rightFields.forEach(([l, v], i) => drawField(left + colW + colGap, gridTop + i * rowH, l, v));
  y = gridTop + Math.max(leftFields.length, rightFields.length) * rowH + 6;

  // Exam title band: "Exam 3 — Midterm Assessment"
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(INK)
    .text(`Exam ${h.examSequence} — ${h.title}`, left, y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  y = doc.y + 2;

  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(`Course Teacher: ${h.teacher}`, left, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 12;

  return y;
}

// ─────────────────────────────── Overall ───────────────────────────────
export async function writeOverallExcel(data: OverallData, path: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const h = data.header;
  const ws = wb.addWorksheet('Result Sheet', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  // Letterhead block (merged rows).
  const perQ = data.questions.map((q) => `${q.label} (${q.maxMarks})`);
  const lastCol = 4 + data.questions.length + 3; // Roll, ID, Name, ...Q..., Total, %, Rank, Status
  const wide = (r: number, text: string, opts: Partial<ExcelJS.Font> = {}) => {
    ws.mergeCells(r, 1, r, lastCol);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.alignment = { horizontal: 'center' };
    c.font = { name: 'Calibri', ...opts };
  };
  wide(1, h.institution, { bold: true, size: 16, color: { argb: 'FF1E3A5F' } });
  wide(2, h.department, { size: 11 });
  wide(3, h.program, { size: 10, color: { argb: 'FF555555' } });
  wide(4, `Exam ${h.examSequence} — ${h.title}`, { bold: true, size: 12 });
  wide(5, `${h.courseName} (${h.courseCode}) · ${h.partName} · ${h.semester}`, { size: 10 });
  wide(
    6,
    `Session: ${h.batch}    Date: ${h.examDate}    Duration: ${h.duration}    Full marks: ${h.totalMarks}`,
    { size: 10 },
  );
  wide(7, `Course Teacher: ${h.teacher}`, { size: 10, italic: true, color: { argb: 'FF555555' } });
  ws.addRow([]); // row 8 spacer

  // Table header (row 9).
  const headerRow = ws.addRow([
    'Roll',
    'Student ID',
    'Name',
    ...perQ,
    'Total',
    '%',
    'Rank',
    'Status',
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } } };
  });

  ws.columns = [
    { width: 10 },
    { width: 15 },
    { width: 26 },
    ...data.questions.map(() => ({ width: 9 })),
    { width: 9 },
    { width: 7 },
    { width: 7 },
    { width: 11 },
  ];

  data.rows.forEach((r, i) => {
    const row = ws.addRow([
      r.rollNumber ?? '—',
      r.studentId,
      r.name,
      ...data.questions.map((q) => r.scores[q.questionPublicId] ?? 0),
      r.totalScore,
      round1(r.percentage),
      r.rank ?? '—',
      r.status === 'attempted' ? 'Present' : 'Absent',
    ]);
    if (i % 2 === 1) {
      row.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };
      });
    }
    if (r.status === 'absent') {
      row.getCell(lastCol).font = { color: { argb: 'FFB00020' } };
    }
  });

  await wb.xlsx.writeFile(path);
}

export async function writeOverallPdf(data: OverallData, path: string): Promise<void> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
  const stream = createWriteStream(path);
  doc.pipe(stream);

  let y = drawLetterhead(doc, data.header, 'Class Result Sheet');

  // Summary strip.
  const present = data.rows.filter((r) => r.status === 'attempted').length;
  const absent = data.rows.length - present;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `Enrolled: ${data.rows.length}    Present: ${present}    Absent: ${absent}`,
      PAGE_MARGIN,
      y,
      { width: CONTENT_WIDTH, align: 'right' },
    );
  y = doc.y + 8;

  // ── Result table (summary columns; per-question detail lives in Excel) ──
  const cols = [
    { key: 'roll', label: 'Roll', w: 52, align: 'left' as const },
    { key: 'sid', label: 'Student ID', w: 92, align: 'left' as const },
    { key: 'name', label: 'Name', w: 0, align: 'left' as const }, // flex
    { key: 'total', label: 'Marks', w: 66, align: 'right' as const },
    { key: 'pct', label: '%', w: 44, align: 'right' as const },
    { key: 'rank', label: 'Rank', w: 40, align: 'right' as const },
    { key: 'status', label: 'Status', w: 56, align: 'center' as const },
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  const nameCol = cols.find((c) => c.key === 'name')!;
  nameCol.w = CONTENT_WIDTH - fixed;

  const rowH = 18;
  const drawRow = (
    cells: Record<string, string>,
    yy: number,
    opts: { head?: boolean; zebra?: boolean; danger?: boolean } = {},
  ) => {
    let x = PAGE_MARGIN;
    if (opts.head) {
      doc.rect(PAGE_MARGIN, yy, CONTENT_WIDTH, rowH).fill(BRAND);
    } else if (opts.zebra) {
      doc.rect(PAGE_MARGIN, yy, CONTENT_WIDTH, rowH).fill(ZEBRA);
    }
    doc.font(opts.head ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    for (const c of cols) {
      const color = opts.head ? '#ffffff' : opts.danger && c.key === 'status' ? '#b00020' : INK;
      doc
        .fillColor(color)
        .text(cells[c.key] ?? '', x + 5, yy + 5, {
          width: c.w - 10,
          align: c.align,
          lineBreak: false,
        });
      x += c.w;
    }
    // bottom hairline
    if (!opts.head) {
      doc
        .moveTo(PAGE_MARGIN, yy + rowH)
        .lineTo(A4.width - PAGE_MARGIN, yy + rowH)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke();
    }
  };

  const drawHead = (yy: number): number => {
    drawRow(Object.fromEntries(cols.map((c) => [c.key, c.label])), yy, { head: true });
    return yy + rowH;
  };

  y = drawHead(y);

  const bottomLimit = A4.height - PAGE_MARGIN - 24;
  data.rows.forEach((r, i) => {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = drawHead(y);
    }
    drawRow(
      {
        roll: r.rollNumber ?? '—',
        sid: r.studentId,
        name: r.name,
        total: r.status === 'absent' ? '—' : `${r.totalScore} / ${data.header.totalMarks}`,
        pct: r.status === 'absent' ? '—' : `${Math.round(r.percentage)}%`,
        rank: r.rank != null ? String(r.rank) : '—',
        status: r.status === 'attempted' ? 'Present' : 'Absent',
      },
      y,
      { zebra: i % 2 === 1, danger: r.status === 'absent' },
    );
    y += rowH;
  });

  drawFooters(doc);
  await finishPdf(doc, stream);
}

// ─────────────────────────────── Individual ───────────────────────────────
export async function writeIndividualExcel(data: IndividualData, path: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const h = data.header;
  const ws = wb.addWorksheet('Mark Sheet', {
    pageSetup: { paperSize: 9, orientation: 'portrait' },
  });
  const LAST = 8;
  const wide = (r: number, text: string, opts: Partial<ExcelJS.Font> = {}) => {
    ws.mergeCells(r, 1, r, LAST);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.alignment = { horizontal: 'center' };
    c.font = { name: 'Calibri', ...opts };
  };
  wide(1, h.institution, { bold: true, size: 16, color: { argb: 'FF1E3A5F' } });
  wide(2, h.department, { size: 11 });
  wide(3, h.program, { size: 10, color: { argb: 'FF555555' } });
  wide(4, `Exam ${h.examSequence} — ${h.title}`, { bold: true, size: 12 });
  wide(5, `${h.courseName} (${h.courseCode}) · ${h.partName} · ${h.semester}`, { size: 10 });
  wide(6, `Session: ${h.batch}    Date: ${h.examDate}    Duration: ${h.duration}`, { size: 10 });
  wide(7, `Course Teacher: ${h.teacher}`, { size: 10, italic: true, color: { argb: 'FF555555' } });
  ws.addRow([]);
  wide(
    9,
    `${data.student.name}    Roll: ${data.student.rollNumber ?? '—'}    ID: ${data.student.studentId}`,
    { bold: true, size: 11 },
  );
  wide(
    10,
    `Result: ${data.attempt.totalScore} / ${h.totalMarks}  ·  ${round1(data.attempt.percentage)}%  ·  Rank ${data.attempt.rank ?? '—'}  ·  ${data.attempt.status}`,
    { bold: true, size: 11, color: { argb: 'FF1E3A5F' } },
  );
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
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.columns = [
    { width: 4 },
    { width: 9 },
    { width: 42 },
    { width: 32 },
    { width: 8 },
    { width: 6 },
    { width: 28 },
    { width: 30 },
  ];
  data.questions.forEach((q) => {
    ws.addRow([
      q.order,
      q.type,
      q.text,
      q.studentAnswer,
      q.score,
      q.maxMarks,
      q.feedback ?? '',
      q.explanation ?? '',
    ]).alignment = { vertical: 'top', wrapText: true };
  });
  await wb.xlsx.writeFile(path);
}

export async function writeIndividualPdf(data: IndividualData, path: string): Promise<void> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
  const stream = createWriteStream(path);
  doc.pipe(stream);

  let y = drawLetterhead(doc, data.header, 'Individual Mark Sheet');

  // Student identity + result card.
  const cardH = 46;
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, cardH, 4).fill(ZEBRA);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INK)
    .text(data.student.name, PAGE_MARGIN + 12, y + 9, { width: CONTENT_WIDTH - 24 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `Roll ${data.student.rollNumber ?? '—'}   ·   ID ${data.student.studentId}`,
      PAGE_MARGIN + 12,
      y + 25,
      { width: CONTENT_WIDTH - 24 },
    );
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(BRAND)
    .text(`${data.attempt.totalScore} / ${data.header.totalMarks}`, PAGE_MARGIN, y + 8, {
      width: CONTENT_WIDTH - 12,
      align: 'right',
    });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      `${round1(data.attempt.percentage)}%   ·   Rank ${data.attempt.rank ?? '—'}   ·   ${data.attempt.status}`,
      PAGE_MARGIN,
      y + 27,
      { width: CONTENT_WIDTH - 12, align: 'right' },
    );
  y += cardH + 14;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Answer Script', PAGE_MARGIN, y);
  y = doc.y + 4;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(A4.width - PAGE_MARGIN, y)
    .lineWidth(0.5)
    .strokeColor(RULE)
    .stroke();
  y += 8;

  const bottomLimit = A4.height - PAGE_MARGIN - 24;
  data.questions.forEach((q) => {
    // Rough height estimate; break to a new page if the question won't fit.
    if (y + 60 > bottomLimit) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.y = y;
    doc.x = PAGE_MARGIN;
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(INK)
      .text(`${q.order}. `, { continued: true })
      .font('Helvetica')
      .fillColor(MUTED)
      .text(`[${q.type}]  `, { continued: true })
      .font('Helvetica-Bold')
      .fillColor(INK)
      .text(q.text, { width: CONTENT_WIDTH });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333333')
      .text(`Answer: ${q.studentAnswer}`, { width: CONTENT_WIDTH });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(BRAND)
      .text(`Score: ${q.score} / ${q.maxMarks}`, { width: CONTENT_WIDTH });
    if (q.feedback)
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Feedback: ${q.feedback}`, { width: CONTENT_WIDTH });
    if (q.explanation)
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Explanation: ${q.explanation}`, { width: CONTENT_WIDTH });
    doc.moveDown(0.6);
    y = doc.y;
  });

  drawFooters(doc);
  await finishPdf(doc, stream);
}

// ─────────────────────────── Footer (page numbers) ───────────────────────────
function drawFooters(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  const generated = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const yy = A4.height - PAGE_MARGIN + 8;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`Generated ${generated}`, PAGE_MARGIN, yy, { width: CONTENT_WIDTH / 2, align: 'left' });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_MARGIN + CONTENT_WIDTH / 2, yy, {
      width: CONTENT_WIDTH / 2,
      align: 'right',
    });
  }
}

import ExcelJS from 'exceljs';

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]!);
  const maxRows = Number(process.argv[3] ?? 12);
  for (const ws of wb.worksheets) {
    console.log(`=== sheet "${ws.name}" (rows=${ws.rowCount}) ===`);
    ws.eachRow((row, n) => {
      const first = String(row.getCell(1).value ?? '');
      if (n <= maxRows || first.includes('2021001')) {
        const vals = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v)));

        console.log(`  r${n}: ${vals.join(' | ')}`);
      }
    });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

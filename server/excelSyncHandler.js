import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

const FILE_PATH = path.resolve(process.cwd(), 'DIPZ-Business-Tracker.xlsx');

export async function updateExcelTracker(payload) {
  if (!fs.existsSync(FILE_PATH)) {
    throw new Error('DIPZ-Business-Tracker.xlsx not found on admin server.');
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE_PATH);
  const ws = wb.getWorksheet('Daily Sales');
  if (!ws) {
    throw new Error('Daily Sales sheet not found in workbook.');
  }

  const targetDateStr = payload.date || new Date().toISOString().split('T')[0];
  const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');

  let targetRowNumber = -1;
  const maxRow = Math.max(ws.rowCount, 100);
  
  // Search existing rows for matching date
  for (let r = 5; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const cellA = row.getCell(1).value;
    
    if (!cellA && cellA !== 0) {
      if (targetRowNumber === -1) targetRowNumber = r;
      break;
    }
    
    let rowDateStr = '';
    if (cellA instanceof Date) {
      rowDateStr = cellA.toISOString().split('T')[0];
    } else if (typeof cellA === 'string') {
      rowDateStr = cellA.slice(0, 10);
    } else if (typeof cellA === 'number') {
      const jsDate = new Date(Math.round((cellA - 25569) * 86400 * 1000));
      rowDateStr = jsDate.toISOString().split('T')[0];
    }

    if (rowDateStr === targetDateStr) {
      targetRowNumber = r;
      break;
    }
  }

  if (targetRowNumber === -1) {
    targetRowNumber = ws.rowCount + 1;
  }

  const row = ws.getRow(targetRowNumber);
  
  // Col 1: Date
  row.getCell(1).value = targetDate;
  // Col 2: Venue
  row.getCell(2).value = payload.venue || 'Shakshuka Food Park';
  // Col 3: Standard sold
  row.getCell(3).value = Number(payload.standardSold || 0);
  // Col 4: Premium sold
  row.getCell(4).value = Number(payload.premiumSold || 0);
  // Col 5: Free units
  row.getCell(5).value = Number(payload.freeUnits || 0);
  
  // Col 6: Bananas at start
  if (payload.startedStock !== undefined && payload.startedStock !== null && payload.startedStock !== '') {
    row.getCell(6).value = Number(payload.startedStock);
  } else if (!row.getCell(6).value) {
    row.getCell(6).value = 0;
  }
  
  // Col 7: Bananas left
  if (payload.remainingStock !== undefined && payload.remainingStock !== null && payload.remainingStock !== '') {
    row.getCell(7).value = Number(payload.remainingStock);
  } else if (!row.getCell(7).value) {
    row.getCell(7).value = 0;
  }

  // Col 8: Cash collected
  row.getCell(8).value = Number(payload.cashCollected || 0);
  // Col 9: Digital payments
  row.getCell(9).value = Number(payload.digitalCollected || 0);
  // Col 10: Notes
  row.getCell(10).value = payload.notes || `Live POS sync (${new Date().toLocaleTimeString('en-LK')})`;

  row.commit();
  await wb.xlsx.writeFile(FILE_PATH);
  
  return { 
    success: true, 
    row: targetRowNumber, 
    date: targetDateStr, 
    file: 'DIPZ-Business-Tracker.xlsx',
    updatedAt: new Date().toISOString()
  };
}

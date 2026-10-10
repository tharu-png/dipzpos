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
  
  // ── 1. Update "Daily Sales" sheet (Exactly 1 row per date) ─────────
  const ws = wb.getWorksheet('Daily Sales');
  if (!ws) {
    throw new Error('Daily Sales sheet not found in workbook.');
  }

  const targetDateStr = payload.date || new Date().toISOString().split('T')[0];
  const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');

  let targetRowNumber = -1;
  let firstEmptyRow = -1;
  const maxRow = Math.max(ws.rowCount, 100);
  
  // Search existing rows for matching date
  for (let r = 5; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const cellA = row.getCell(1).value;
    
    if (!cellA && cellA !== 0) {
      if (firstEmptyRow === -1) firstEmptyRow = r;
      continue;
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
    targetRowNumber = (firstEmptyRow !== -1) ? firstEmptyRow : (ws.rowCount + 1);
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

  // Formulas for calculated columns (Cols 11-17)
  const r = targetRowNumber;
  row.getCell(11).value = { formula: `IF($A${r}="","",C${r}+D${r})` };
  row.getCell(12).value = { formula: `IF($A${r}="","",C${r}*SUMIFS(Settings!$B$21:$B$25,Settings!$A$21:$A$25,SUMPRODUCT(MAX((Settings!$A$21:$A$25<=$A${r})*Settings!$A$21:$A$25)))+D${r}*SUMIFS(Settings!$C$21:$C$25,Settings!$A$21:$A$25,SUMPRODUCT(MAX((Settings!$A$21:$A$25<=$A${r})*Settings!$A$21:$A$25))))` };
  row.getCell(13).value = { formula: `IF($A${r}="","",L${r}*IFERROR(INDEX(Settings!$B$30:$B$36,MATCH($B${r},Settings!$A$30:$A$36,0)),0))` };
  row.getCell(14).value = { formula: `IF(OR($A${r}="",F${r}="",G${r}=""),"",(F${r}-G${r})-(K${r}+E${r}))` };
  row.getCell(15).value = { formula: `IF(N${r}="","",IF(N${r}=0,"OK","CHECK"))` };
  row.getCell(16).value = { formula: `IF(OR($A${r}="",AND(H${r}="",I${r}="")),"",H${r}+I${r}-L${r})` };
  row.getCell(17).value = { formula: `IF(P${r}="","",IF(P${r}=0,"OK","CHECK"))` };

  row.commit();

  // ── 2. Update "Intraday Orders" sheet (Individual orders log) ─────
  let ordersSheet = wb.getWorksheet('Intraday Orders');
  if (!ordersSheet) {
    ordersSheet = wb.addWorksheet('Intraday Orders');
    const headerRow = ordersSheet.getRow(1);
    headerRow.values = [
      'Date', 'Time', 'Order ID', 'Items Breakdown', 'Total (LKR)', 'Payment Method', 'Cash Received', 'Change', 'Status'
    ];
    headerRow.font = { bold: true, color: { argb: 'FF713F12' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF08A' }
    };
    headerRow.commit();
  }

  if (Array.isArray(payload.orders) && payload.orders.length > 0) {
    const existingOrderRows = {};
    for (let i = 2; i <= ordersSheet.rowCount; i++) {
      const orderIdVal = ordersSheet.getRow(i).getCell(3).value;
      if (orderIdVal) {
        existingOrderRows[String(orderIdVal).trim()] = i;
      }
    }

    payload.orders.forEach((o) => {
      if (!o || !o.id) return;
      const orderId = String(o.id).trim();
      const timeStr = o.timestamp ? new Date(o.timestamp).toLocaleTimeString('en-LK') : '';
      
      const targetOrderRowNumber = existingOrderRows[orderId] || (ordersSheet.rowCount + 1);
      const orderRow = ordersSheet.getRow(targetOrderRowNumber);
      
      orderRow.getCell(1).value = payload.date;
      orderRow.getCell(2).value = timeStr;
      orderRow.getCell(3).value = orderId;
      orderRow.getCell(4).value = o.itemsSummary || o.items || '';
      orderRow.getCell(5).value = Number(o.total || 0);
      orderRow.getCell(6).value = o.paymentMethod || 'cash';
      orderRow.getCell(7).value = Number(o.received || o.total || 0);
      orderRow.getCell(8).value = Number(o.change || 0);
      orderRow.getCell(9).value = o.status || 'completed';
      orderRow.commit();

      existingOrderRows[orderId] = targetOrderRowNumber;
    });
  }

  await wb.xlsx.writeFile(FILE_PATH);
  
  return { 
    success: true, 
    dailyRow: targetRowNumber, 
    date: targetDateStr, 
    file: 'DIPZ-Business-Tracker.xlsx',
    ordersLogged: (payload.orders || []).length,
    updatedAt: new Date().toISOString()
  };
}

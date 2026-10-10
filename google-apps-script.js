/**
 * DIPZ POS - Google Sheets Live Remote Sync
 * 
 * Instructions:
 * 1. Open your DIPZ Tracker in Google Sheets.
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete any code in the editor and paste this entire code.
 * 4. Click "Deploy" > "New deployment".
 * 5. Click the gear icon (Select type) > Choose "Web app".
 * 6. Set Description: "DIPZ POS Live Sync"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone"  <-- CRITICAL!
 * 9. Click "Deploy", copy the Web App URL (ends in /exec).
 * 10. Paste that URL into DIPZ POS Settings > "Google Sheets Webhook URL".
 */

function doPost(e) {
  try {
    var contents = e.postData.contents;
    var payload = JSON.parse(contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Daily Sales");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Daily Sales sheet not found" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var targetDateStr = payload.date; // e.g. "2026-10-10"
    var lastRow = Math.max(sheet.getLastRow(), 5);
    var targetRow = -1;

    // Search existing rows in Column A starting at row 5
    for (var r = 5; r <= lastRow; r++) {
      var cellVal = sheet.getRange(r, 1).getValue();
      if (!cellVal) {
        if (targetRow === -1) targetRow = r;
        break;
      }
      var rowDateStr = "";
      if (cellVal instanceof Date) {
        rowDateStr = Utilities.formatDate(cellVal, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        rowDateStr = String(cellVal).slice(0, 10);
      }
      if (rowDateStr === targetDateStr) {
        targetRow = r;
        break;
      }
    }

    if (targetRow === -1) {
      targetRow = lastRow + 1;
    }

    // Set values for columns 1 to 10
    // Col 1: Date
    sheet.getRange(targetRow, 1).setValue(targetDateStr);
    // Col 2: Venue
    sheet.getRange(targetRow, 2).setValue(payload.venue || "Shakshuka Food Park");
    // Col 3: Standard sold
    sheet.getRange(targetRow, 3).setValue(Number(payload.standardSold || 0));
    // Col 4: Premium sold
    sheet.getRange(targetRow, 4).setValue(Number(payload.premiumSold || 0));
    // Col 5: Free units
    sheet.getRange(targetRow, 5).setValue(Number(payload.freeUnits || 0));
    
    // Col 6: Bananas at start
    if (payload.startedStock !== null && payload.startedStock !== undefined && payload.startedStock !== "") {
      sheet.getRange(targetRow, 6).setValue(Number(payload.startedStock));
    }
    
    // Col 7: Bananas left
    if (payload.remainingStock !== null && payload.remainingStock !== undefined && payload.remainingStock !== "") {
      sheet.getRange(targetRow, 7).setValue(Number(payload.remainingStock));
    }
    
    // Col 8: Cash collected
    sheet.getRange(targetRow, 8).setValue(Number(payload.cashCollected || 0));
    // Col 9: Digital payments
    sheet.getRange(targetRow, 9).setValue(Number(payload.digitalCollected || 0));
    // Col 10: Notes
    sheet.getRange(targetRow, 10).setValue(payload.notes || ("Live POS sync at " + new Date().toLocaleTimeString()));

    // Ensure formulas in Columns 11 to 17 (Units sold, Revenue, Venue share, etc.) are present
    var formulaCell = sheet.getRange(targetRow, 11).getFormula();
    if (!formulaCell && targetRow > 5) {
      sheet.getRange(targetRow - 1, 11, 1, 7).copyTo(
        sheet.getRange(targetRow, 11, 1, 7),
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, row: targetRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "DIPZ Google Sheets Sync Webhook is Active" }))
    .setMimeType(ContentService.MimeType.JSON);
}

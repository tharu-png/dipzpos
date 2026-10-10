/**
 * DIPZ POS - Google Sheets Live Sync (Daily Summary + Intraday Orders)
 * 
 * Features:
 * 1. "Daily Sales": Exactly 1 row per calendar day with cumulative sales & calculations.
 * 2. "Intraday Orders": Every single order logged individually with Order ID, items, time, and bill total.
 */

function getLocalDateString(val) {
  if (!val) return "";
  if (val instanceof Date) {
    try {
      return Utilities.formatDate(val, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd");
    } catch (e) {
      var y = val.getFullYear();
      var m = String(val.getMonth() + 1).padStart(2, "0");
      var d = String(val.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + d;
    }
  }
  var str = String(val).trim();
  var match = str.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  var d = new Date(str);
  if (!isNaN(d.getTime())) {
    try {
      return Utilities.formatDate(d, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd");
    } catch (e) {
      return str.slice(0, 10);
    }
  }
  return str.slice(0, 10);
}

function doPost(e) {
  try {
    var contents = e.postData.contents;
    var payload = JSON.parse(contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ═══════════════════════════════════════════════════════════════════════
    // 1. UPDATE "Daily Sales" (EXACTLY 1 ROW PER DAY)
    // ═══════════════════════════════════════════════════════════════════════
    var dailySheet = ss.getSheetByName("Daily Sales");
    if (!dailySheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Daily Sales sheet not found" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var targetDateStr = payload.date; // e.g. "2026-10-10"
    var lastRow = Math.max(dailySheet.getLastRow(), 5);
    var targetRow = -1;
    var firstEmptyRow = -1;

    // Search Column A starting at row 5 for matching date
    for (var r = 5; r <= lastRow; r++) {
      var cellVal = dailySheet.getRange(r, 1).getValue();
      if (!cellVal || cellVal === "") {
        if (firstEmptyRow === -1) firstEmptyRow = r;
        continue;
      }
      var rowDateStr = getLocalDateString(cellVal);
      if (rowDateStr === targetDateStr) {
        targetRow = r;
        break;
      }
    }

    // If date not found in existing rows, use the first empty row or append
    if (targetRow === -1) {
      targetRow = (firstEmptyRow !== -1) ? firstEmptyRow : (lastRow + 1);
    }

    // Write today's cumulative totals to targetRow
    dailySheet.getRange(targetRow, 1).setValue(targetDateStr);
    dailySheet.getRange(targetRow, 2).setValue(payload.venue || "Shakshuka Food Park");
    dailySheet.getRange(targetRow, 3).setValue(Number(payload.standardSold || 0));
    dailySheet.getRange(targetRow, 4).setValue(Number(payload.premiumSold || 0));
    dailySheet.getRange(targetRow, 5).setValue(Number(payload.freeUnits || 0));

    if (payload.startedStock !== null && payload.startedStock !== undefined && payload.startedStock !== "") {
      dailySheet.getRange(targetRow, 6).setValue(Number(payload.startedStock));
    }

    if (payload.remainingStock !== null && payload.remainingStock !== undefined && payload.remainingStock !== "") {
      dailySheet.getRange(targetRow, 7).setValue(Number(payload.remainingStock));
    }

    dailySheet.getRange(targetRow, 8).setValue(Number(payload.cashCollected || 0));
    dailySheet.getRange(targetRow, 9).setValue(Number(payload.digitalCollected || 0));
    dailySheet.getRange(targetRow, 10).setValue(payload.notes || ("Live POS sync at " + new Date().toLocaleTimeString()));

    // Ensure formula columns 11-17 (Units sold, Revenue, Venue share, etc.) exist
    var formulaCell = dailySheet.getRange(targetRow, 11).getFormula();
    if (!formulaCell && targetRow > 5) {
      dailySheet.getRange(targetRow - 1, 11, 1, 7).copyTo(
        dailySheet.getRange(targetRow, 11, 1, 7),
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. UPDATE "Intraday Orders" (INDIVIDUAL ORDERS LOG)
    // ═══════════════════════════════════════════════════════════════════════
    var ordersSheet = ss.getSheetByName("Intraday Orders");
    if (!ordersSheet) {
      ordersSheet = ss.insertSheet("Intraday Orders");
      var headers = [
        "Date", "Time", "Order ID", "Items Breakdown", "Total (LKR)", "Payment Method", "Cash Received", "Change", "Status"
      ];
      ordersSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      ordersSheet.getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#fef08a")
        .setFontColor("#713f12");
      ordersSheet.setFrozenRows(1);
    }

    if (Array.isArray(payload.orders) && payload.orders.length > 0) {
      var ordersLastRow = ordersSheet.getLastRow();
      var existingOrderIds = {};

      if (ordersLastRow > 1) {
        var idValues = ordersSheet.getRange(2, 3, ordersLastRow - 1, 1).getValues();
        for (var i = 0; i < idValues.length; i++) {
          if (idValues[i][0]) {
            existingOrderIds[String(idValues[i][0]).trim()] = i + 2; // Store row number
          }
        }
      }

      payload.orders.forEach(function(o) {
        if (!o || !o.id) return;
        var orderId = String(o.id).trim();
        var timeStr = "";
        if (o.timestamp) {
          try {
            timeStr = new Date(o.timestamp).toLocaleTimeString();
          } catch(err) {
            timeStr = String(o.timestamp);
          }
        }

        var rowData = [
          payload.date,
          timeStr,
          orderId,
          o.itemsSummary || o.items || "",
          Number(o.total || 0),
          o.paymentMethod || "cash",
          Number(o.received || o.total || 0),
          Number(o.change || 0),
          o.status || "completed"
        ];

        if (existingOrderIds[orderId]) {
          // Update existing order row
          ordersSheet.getRange(existingOrderIds[orderId], 1, 1, rowData.length).setValues([rowData]);
        } else {
          // Append new order row
          ordersSheet.appendRow(rowData);
          existingOrderIds[orderId] = ordersSheet.getLastRow();
        }
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      dailyRow: targetRow, 
      intradayOrdersCount: (payload.orders || []).length 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "DIPZ Google Sheets Sync Webhook is Active" }))
    .setMimeType(ContentService.MimeType.JSON);
}

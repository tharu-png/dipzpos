import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { updateExcelTracker } from './excelSyncHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3001;

const server = http.createServer(async (req, res) => {
  // CORS — allow requests from any origin (tablet, deployed app, localhost)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url?.split('?')[0];

  // ── 1. Health / status check ──────────────────────────────────────
  if (url === '/api/spreadsheet-status' && req.method === 'GET') {
    const exists = fs.existsSync(path.join(ROOT, 'DIPZ-Business-Tracker.xlsx'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ connected: true, localExcelExists: exists, port: PORT }));
  }

  // ── 2. Download updated Excel file ───────────────────────────────
  if (url === '/api/download-excel' && req.method === 'GET') {
    const filePath = path.join(ROOT, 'DIPZ-Business-Tracker.xlsx');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'File not found' }));
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="DIPZ-Business-Tracker.xlsx"',
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  // ── 3. Sync order → Excel (called after EVERY order) ─────────────
  if ((url === '/api/sync-excel' || url === '/api/sync-order') && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(raw || '{}');
        console.log(`[Sync] ${new Date().toLocaleTimeString()} → ${payload.date} | Std:${payload.standardSold} Prm:${payload.premiumSold} Cash:${payload.cashCollected} Digital:${payload.digitalCollected}`);
        const result = await updateExcelTracker(payload);
        console.log(`[Sync] ✅ Written to row ${result.row} in DIPZ-Business-Tracker.xlsx`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('[Sync] ❌ Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── 404 for anything else ────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ DIPZ Excel Sync Server running on http://localhost:${PORT}`);
  console.log(`   Watching: DIPZ-Business-Tracker.xlsx`);
  console.log(`   Ready to receive orders from store tablet...\n`);
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { updateExcelTracker } from './server/excelSyncHandler.js';

function excelSyncPlugin() {
  return {
    name: 'excel-sync-api',
    configureServer(server) {
      // CORS & JSON middleware for spreadsheet sync API
      server.middlewares.use(async (req, res, next) => {
        // Enable CORS for local network devices (e.g. store tablet)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        const url = req.url.split('?')[0];

        // 1. Status Check
        if (url === '/api/spreadsheet-status' && req.method === 'GET') {
          const fileExists = fs.existsSync(path.resolve(process.cwd(), 'DIPZ-Business-Tracker.xlsx'));
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ 
            connected: true, 
            localExcelExists: fileExists,
            fileName: 'DIPZ-Business-Tracker.xlsx' 
          }));
        }

        // 2. Download Updated Excel File
        if (url === '/api/download-excel' && req.method === 'GET') {
          const filePath = path.resolve(process.cwd(), 'DIPZ-Business-Tracker.xlsx');
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="DIPZ-Business-Tracker.xlsx"');
            const fileStream = fs.createReadStream(filePath);
            return fileStream.pipe(res);
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'Spreadsheet file not found on server' }));
          }
        }

        // 3. Sync Order / Daily Data to Excel
        if ((url === '/api/sync-excel' || url === '/api/sync-order') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const result = await updateExcelTracker(payload);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify(result));
            } catch (err) {
              console.error('[Excel Sync Error]:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message || 'Failed to update Excel tracker' }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), excelSyncPlugin()],
  server: {
    host: true, // Expose to local store network so tablet can connect
    port: 5173,
  }
});

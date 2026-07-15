const http = require('http');
const { handleRequest, sendJson } = require('./routes');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  let body = '';

  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      await handleRequest(req, res, body);
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'INTERNAL_SERVER_ERROR'
      });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`oneMind backend listening at http://${HOST}:${PORT}`);
});

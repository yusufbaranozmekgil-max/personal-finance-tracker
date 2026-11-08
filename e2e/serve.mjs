// usage: node serve.mjs <dir> <port> — static server with SPA fallback
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [,, rawDir, port] = process.argv;
const dir = path.resolve(rawDir);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(path.resolve(dir)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dir, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(+port, () => console.log('serving', dir, port));

// Local dev server: serves ./public (or the dir in argv[3]) and mounts every file in ./api as /api/<name>. Usage: node server.js 5055 [dir]
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[3] || 'public');
const handlers = {};
fs.readdirSync(path.join(__dirname, 'api')).forEach(f => { if (f[0] !== '_' && f.endsWith('.js')) handlers[f.slice(0, -3)] = require('./api/' + f); });
http.createServer((req, res) => {
  const m = /^\/api\/([a-z]+)/.exec(req.url);
  if (m && handlers[m[1]]) {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try { req.body = body ? JSON.parse(body) : null; } catch (e) { req.body = null; }
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      handlers[m[1]](req, res);
    });
    return;
  }
  const f = path.join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; res.end('nf'); } else { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'text/plain'); res.end(d); } });
}).listen(+process.argv[2] || 5055, () => console.log('up'));

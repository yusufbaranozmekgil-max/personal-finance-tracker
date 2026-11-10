// Prepares the production build for GitHub Pages, which cannot send response headers.
// Copies the CSP from vercel.json into a <meta> tag (minus frame-ancestors, which a meta tag
// cannot carry) and adds 404.html so deep links like /settings load the app.
import fs from 'node:fs';

const dir = 'dist/finans-takip/browser';
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const csp = vercel.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value
  .split(';').map(s => s.trim()).filter(s => s && !s.startsWith('frame-ancestors')).join('; ');

const file = `${dir}/index.html`;
let html = fs.readFileSync(file, 'utf8');
if (!html.includes('http-equiv="Content-Security-Policy"')) {
  html = html.replace('<meta charset="utf-8">',
    `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <meta name="referrer" content="no-referrer">`);
}
fs.writeFileSync(file, html);
fs.writeFileSync(`${dir}/404.html`, html);
fs.writeFileSync(`${dir}/.nojekyll`, '');
console.log('pages: CSP meta added, 404.html written');

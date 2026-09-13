import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { pulsePath, pulseNode, pulseTransform } from '../shared/brand.js';
const symbol = `<g transform="${pulseTransform}"><path d="${pulsePath}"/><circle cx="${pulseNode.cx}" cy="${pulseNode.cy}" r="${pulseNode.r}"/></g>`;
const mark = (x,y,size,color) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64" fill="${color}">${symbol}</svg>`;
const icons = (x,y,color,bg) => [16,24,32,48,64].map((s,i)=>`<rect x="${x+i*80}" y="${y+64-s}" width="${s}" height="${s}" rx="${s/4}" fill="${bg}"/>${mark(x+i*80,y+64-s,s,color)}`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">
<rect width="600" height="700" fill="#fafafa"/><rect x="600" width="600" height="700" fill="#161616"/>
<g font-family="Arial,sans-serif" font-size="12" letter-spacing="3"><text x="48" y="54" fill="#5c5c5c">PULSE / SIGNAL MONOGRAM</text><text x="648" y="54" fill="#a3a3a3">ONE MARK. EVERY SURFACE.</text></g>
${mark(140,100,320,'#161616')}${mark(740,100,320,'#ffffff')}
<path d="M48 477H552" stroke="#e5e5e5"/><path d="M648 477H1152" stroke="#303030"/>
<g font-family="Arial,sans-serif" font-size="12" letter-spacing="2"><text x="48" y="516" fill="#707070">LIGHT / INK ON WHITE</text><text x="648" y="516" fill="#a3a3a3">DARK / WHITE ON CHARCOAL</text></g>
${icons(48,552,'#ffffff','#161616')}${icons(648,552,'#161616','#fafafa')}
<g font-family="Arial,sans-serif" font-size="11" fill="#707070"><text x="48" y="660">16 / 24 / 32 / 48 / 64 px</text><text x="648" y="660" fill="#a3a3a3">A custom P. A connected system. A live signal.</text></g></svg>`;
writeFileSync('design/pulse-logo-preview.svg',svg);
writeFileSync('design/pulse-logo-preview.png',new Resvg(svg).render().asPng());

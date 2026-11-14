// Charts drawn by hand on <canvas>, devicePixelRatio aware. No chart library.
const Charts = (() => {
  const C = {g: '#00d35a', r: '#ff453a', o: '#ff9f0a', b: '#0a84ff', t2: 'rgba(235,235,245,0.6)', t3: 'rgba(235,235,245,0.3)'};
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setup(cv) {
    const d = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h);
    return {x, w, h};
  }
  function dashed(x, y, w, color) { x.save(); x.setLineDash([4, 4]); x.strokeStyle = color; x.lineWidth = 1; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); x.restore(); }

  // Home LIVE line: green line, gradient fill, dashed start line, marks that never overlap.
  let anim = null;
  function line(cv, data, prevLen) {
    const {x, w, h} = setup(cv);
    const pts = data.points || [], start = data.start;
    const top = 34, bot = h - 10;
    if (pts.length < 2) { dashed(x, (top + bot) / 2, w, C.t3); return false; }
    const vs = pts.map(p => p.value), t0 = pts[0].ts, t1 = pts[pts.length - 1].ts || t0 + 1;
    let lo = Math.min(...vs, start), hi = Math.max(...vs, start); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const X = t => (t1 === t0 ? w : (t - t0) / (t1 - t0) * w), Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    const draw = k => {
      const {x} = setup(cv);
      dashed(x, Y(start), w, C.t3);
      const n = Math.max(2, Math.floor(prevLen + (pts.length - prevLen) * k));
      const P = pts.slice(0, n);
      const grad = x.createLinearGradient(0, top, 0, bot); grad.addColorStop(0, 'rgba(0,211,90,0.28)'); grad.addColorStop(1, 'rgba(0,211,90,0)');
      x.beginPath(); P.forEach((p, i) => i ? x.lineTo(X(p.ts), Y(p.value)) : x.moveTo(X(p.ts), Y(p.value)));
      x.lineTo(X(P[P.length - 1].ts), bot); x.lineTo(X(P[0].ts), bot); x.closePath(); x.fillStyle = grad; x.fill();
      x.beginPath(); P.forEach((p, i) => i ? x.lineTo(X(p.ts), Y(p.value)) : x.moveTo(X(p.ts), Y(p.value)));
      x.strokeStyle = C.g; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();
      // marks above the line; a later mark that would overlap moves up a row
      x.globalAlpha = k; x.font = '600 11px -apple-system,system-ui,sans-serif';
      const placed = [];
      (data.marks || []).forEach(m => {
        if (m.ts < t0) return;
        let label, col;
        if (m.kind === 'bought') { label = m.title; col = C.b; }
        else if (m.kind === 'stopped') { label = `-${data.stop_pct}% · ${m.value}`; col = C.r; }
        else { label = (m.value || '').split(' / ')[0]; col = (label || '').startsWith('-') ? C.r : C.g; }
        const tw = x.measureText(label).width + 12, mx = Math.min(Math.max(X(m.ts) - tw / 2, 0), w - tw);
        let row = 0; while (placed.some(p => p.row === row && mx < p.x + p.w + 4 && mx + tw + 4 > p.x)) row++;
        placed.push({x: mx, w: tw, row});
        const my = Math.max(2, Y(valueAt(pts, m.ts)) - 26 - row * 22);
        x.fillStyle = col + '33'; roundRect(x, mx, my, tw, 18, 9); x.fill();
        x.fillStyle = col; x.fillText(label, mx + 6, my + 13);
      });
      x.globalAlpha = 1;
    };
    if (anim) cancelAnimationFrame(anim);
    if (reduced() || prevLen >= pts.length) { draw(1); return true; }
    const s = performance.now();
    const step = now => { const k = Math.min(1, (now - s) / 250); draw(k); if (k < 1) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step); return true;
  }
  function valueAt(pts, ts) { let v = pts[0].value; for (const p of pts) { if (p.ts > ts) break; v = p.value; } return v; }
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

  // Coin: 1-minute OHLC from db.prices, volume bar = change of DexScreener volume.m5, orange dashed exit line.
  function candles(cv, prices, exitLine, entry) {
    const {x, w, h} = setup(cv);
    const buckets = new Map();
    let prevVol = null;
    prices.forEach(p => {
      const m = Math.floor(p.ts / 60);
      let c = buckets.get(m);
      if (!c) { c = {o: p.price, h: p.price, l: p.price, c: p.price, v: 0}; buckets.set(m, c); }
      c.h = Math.max(c.h, p.price); c.l = Math.min(c.l, p.price); c.c = p.price;
      if (prevVol != null && p.volume_m5 != null) c.v += Math.max(0, p.volume_m5 - prevVol);
      if (p.volume_m5 != null) prevVol = p.volume_m5;
    });
    const cs = [...buckets.values()].slice(-60);
    if (!cs.length) return false;
    const volH = h * 0.18, top = 12, bot = h - volH - 8;
    let lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo < hi * 1e-6) { hi *= 1.01; lo *= 0.99; }
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top), cw = w / Math.max(cs.length, 20), vmax = Math.max(1, ...cs.map(c => c.v));
    if (entry) dashed(x, Y(entry), w, C.t3);
    cs.forEach((c, i) => {
      const cx = i * cw + cw / 2, col = c.c >= c.o ? C.g : C.r;
      x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, Y(c.h)); x.lineTo(cx, Y(c.l)); x.stroke();
      x.fillStyle = col; const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      x.fillRect(cx - cw * 0.35, y1, cw * 0.7, Math.max(1, y2 - y1));
      x.globalAlpha = 0.35; const vh = c.v / vmax * volH; x.fillRect(cx - cw * 0.35, h - vh, cw * 0.7, vh); x.globalAlpha = 1;
    });
    if (exitLine) {
      x.save(); x.setLineDash([6, 4]); x.strokeStyle = C.o; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, Y(exitLine)); x.lineTo(w, Y(exitLine)); x.stroke(); x.restore();
      x.fillStyle = C.o; x.font = '600 11px -apple-system,system-ui,sans-serif'; x.fillText('Risk trailing stop', 6, Y(exitLine) - 5);
    }
    return true;
  }

  // Analyst score ring 0-100, green from min_score.
  function ring(cv, score, minScore) {
    const {x, w, h} = setup(cv), r = Math.min(w, h) / 2 - 8, cx = w / 2, cy = h / 2;
    x.lineWidth = 10; x.lineCap = 'round';
    x.strokeStyle = '#2c2c2e'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    if (score != null) {
      x.strokeStyle = score >= minScore ? C.g : '#ffd60a';
      x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(100, score)) / 100); x.stroke();
    }
    x.fillStyle = '#fff'; x.font = '600 30px -apple-system,system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(score == null ? '–' : String(score), cx, cy);
  }
  return {line, candles, ring};
})();

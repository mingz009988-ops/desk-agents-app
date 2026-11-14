// Desk app (source STEP 8). Plain JS. Token arrives once as {URL}#t={APP_TOKEN} and then lives in localStorage.
(() => {
'use strict';
const m = location.hash.match(/[#&]t=([^&]+)/);
const md = location.hash.match(/[#&]d=([^&]+)/);   // plan B (STEP 7): published snapshot, '<secret dir>.<key>'
if (m) localStorage.setItem('desk_t', decodeURIComponent(m[1]));
if (md) localStorage.setItem('desk_d', decodeURIComponent(md[1]));
if (m || md) history.replaceState(null, '', location.pathname + location.search);
const TOKEN = localStorage.getItem('desk_t') || '';
const PUB = localStorage.getItem('desk_d') || '';
const GH = location.hostname.endsWith('.github.io') ? {owner: location.hostname.split('.')[0], repo: location.pathname.split('/')[1]} : null;
const PLANB = !!GH || (!!PUB && !TOKEN);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = {scanner: '#64d2ff', auditor: '#ffffff', analyst: '#ffd60a', executor: '#00d35a', risk: '#ff6b9a'};
const NAMES = {scanner: 'Scanner', auditor: 'Auditor', analyst: 'Analyst', executor: 'Executor', risk: 'Risk'};
const money = v => v == null ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const usdK = v => v == null ? '—' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(0);
const price = v => v == null ? '—' : '$' + (v >= 1 ? v.toFixed(4) : v.toPrecision(4));
const hhmm = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '';
const age = ts => { if (!ts) return ''; const mn = (Date.now() / 1000 - ts) / 60; return mn < 60 ? Math.floor(mn) + 'm' : Math.floor(mn / 60) + 'h'; };
let S = null, lastOk = 0, failN = 0, range = 'LIVE', chartLen = 0, settingsMeta = null;

async function api(path, opt = {}) {
  if (PLANB) return apiB(path, opt);
  const r = await fetch(path, {...opt, headers: {'Content-Type': 'application/json', 'X-App-Token': TOKEN, ...(opt.headers || {})}});
  if (r.status === 401) { showOffline('Not signed in · open the link with #t= once'); throw new Error('401'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.status), {body: j});
  return j;
}
// ---- plan B: read-only snapshot pushed by the box every ~75s. AES-GCM encrypted; the key only lives in the #d= fragment.
let B = null, Bat = 0, Bp = null;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function fetchBlob(dir) {
  const rel = `d/${dir}/b.bin`, urls = [];
  if (GH) {
    let sha = sessionStorage.getItem('desk_sha') || '';
    if (!sha || Date.now() - +(sessionStorage.getItem('desk_sha_at') || 0) > 90000) {
      try {
        const r = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/commits/main`, {cache: 'no-store'});
        if (r.ok) { sha = (await r.json()).sha || sha; sessionStorage.setItem('desk_sha', sha); sessionStorage.setItem('desk_sha_at', String(Date.now())); }
      } catch (e) {}
    }
    if (sha) urls.push(`https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/${sha}/${rel}`);
    urls.push(`https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/main/${rel}?ts=${Date.now()}`);
  }
  urls.push(`${rel}?ts=${Date.now()}`);
  for (const u of urls) { try { const r = await fetch(u, {cache: 'no-store'}); if (r.ok) return new Uint8Array(await r.arrayBuffer()); } catch (e) {} }
  throw new Error('offline');
}
async function bundle() {
  if (B && Date.now() - Bat < 25000) return B;
  if (Bp) return Bp;
  Bp = (async () => {
    try {
      const i = PUB.lastIndexOf('.');
      if (i < 1) { showOffline('Not set up · open the published link with #d= once'); throw new Error('401'); }
      const raw = await fetchBlob(PUB.slice(0, i));
      const key = await crypto.subtle.importKey('raw', b64u(PUB.slice(i + 1)), 'AES-GCM', false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: raw.slice(0, 12)}, key, raw.slice(12));
      const txt = await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      B = JSON.parse(txt); Bat = Date.now(); return B;
    } finally { Bp = null; }
  })();
  return Bp;
}
async function apiB(path, opt) {
  if (opt.method && opt.method !== 'GET') throw new Error('Unavailable in the published view (read-only)');
  const b = await bundle();
  const [p, q] = path.split('?'), qs = new URLSearchParams(q || '');
  const need = v => { if (v == null) throw new Error('Not in the published snapshot'); return v; };
  if (p === '/api/chart') return need(b['/api/chart?range=' + (qs.get('range') || 'LIVE')]);
  if (p === '/api/activity') { const all = b['/api/activity'] || [], bf = +(qs.get('before') || Infinity); return all.filter(r => r.ts < bf).slice(0, 30); }
  if (p === '/api/notifications') { const since = +(qs.get('since') || 0); return (b['/api/notifications'] || []).filter(r => r.ts > since); }
  if (p === '/api/search') {
    const t = (qs.get('q') || '').trim().toLowerCase(); if (!t) return [];
    return (b['/api/search_index'] || []).filter(r => r.mint === qs.get('q').trim() || (r.name || '').toLowerCase().includes(t) || (r.symbol || '').toLowerCase().includes(t)).slice(0, 20);
  }
  return need(b[p]);
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.add('hidden'), 2600); }

// error row: keep the last good numbers, never blank, never made up
let retryAt = 0;
function showOffline(text) { const el = $('offline'); el.textContent = text; el.classList.remove('hidden'); }
function offlineTick() {
  if (!retryAt) return;
  const n = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  showOffline(`Desk offline · retrying in ${n}s · last update ${lastOk ? new Date(lastOk).toLocaleTimeString() : 'never'}`);
}
setInterval(offlineTick, 1000);

// odometer: each changed digit rolls 600ms ease-out, 30ms stagger right to left
function odometer(el, text) {
  el.classList.remove('skel');
  if (reduced() || !el.dataset.v || el.dataset.v.length !== text.length) {
    el.innerHTML = [...text].map(ch => /\d/.test(ch)
      ? `<span class="dg"><span class="col" style="transform:translateY(-${+ch * 1.05}em)">${[...'0123456789'].map(d => `<span>${d}</span>`).join('')}</span></span>`
      : `<span>${esc(ch)}</span>`).join('');
    el.dataset.v = text; return;
  }
  const cols = [...el.children], old = el.dataset.v; let k = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] !== old[i] && /\d/.test(text[i]) && cols[i].querySelector('.col')) {
      const col = cols[i].querySelector('.col'); col.style.transitionDelay = (k++ * 30) + 'ms';
      col.style.transform = `translateY(-${+text[i] * 1.05}em)`;
    } else if (text[i] !== old[i]) cols[i].textContent = text[i];
  }
  el.dataset.v = text;
}

// ---------- navigation (tabs + screens, Android back closes a screen) ----------
const tabs = ['home', 'agents', 'activity', 'account'];
function go(tab) {
  tabs.forEach(t => $('tab-' + t).classList.toggle('hidden', t !== tab));
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (tab === 'activity') loadActivity(true);
  if (tab === 'account') loadAccount();
  if (tab === 'agents') renderAgentsTab();
}
document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => go(b.dataset.tab));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
const stack = [];
function openScreen(id) { $(id).classList.remove('hidden'); $(id).scrollTop = 0; stack.push(id); history.pushState({s: id}, ''); }
function closeTop() { const id = stack.pop(); if (id) $(id).classList.add('hidden'); }
window.addEventListener('popstate', closeTop);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => history.back());

// ---------- Home ----------
function activityRow(r) {
  const ic = {bought: 'B', sold: 'S', stopped: '!', rejected: '×'}[r.kind] || '·';
  const valCls = r.kind === 'stopped' || (r.value || '').startsWith('-') ? 'red' : r.kind === 'sold' ? 'green' : r.kind === 'rejected' ? 'sec' : '';
  return `<button class="item tap" style="width:100%;text-align:left" data-kind="${esc(r.kind)}" data-mint="${esc(r.mint)}">
    <span class="ic ${esc(r.kind)}">${ic}</span><span class="tx"><b>${esc(r.title)}</b><span>${esc(r.subtitle)}${r.kind === 'bought' ? ' · ' + hhmm(r.ts) : ''}</span></span>
    <span class="val ${valCls}">${esc(r.value)}</span></button>`;
}
function bindRows(root) {
  root.querySelectorAll('.item[data-mint]').forEach(el => el.onclick = () => {
    if (!el.dataset.mint) return;
    el.dataset.kind === 'rejected' ? openAudit(el.dataset.mint) : openCoin(el.dataset.mint);
  });
}
function card(a) {
  const st = a.paused ? 'paused' : a.running ? 'running' : 'down';
  const dot = `<span class="sdot ${a.paused ? 'off' : a.running ? '' : 'down'}" title="${st}"></span>`;
  const head = `<div class="ahead" style="color:${COLORS[a.name]}">${NAMES[a.name]} ${dot}</div>`;
  if (a.name === 'scanner') {
    const feed = (a.feed || []).map(f => f.verdict === 'pass'
      ? `<li><span>${esc(f.name || f.mint.slice(0, 6))} · liq ${usdK(f.liquidity_usd)}</span><span class="green">→ auditor</span></li>`
      : `<li class="killed"><span>${esc(f.name || f.mint.slice(0, 6))}</span><span class="red">${esc(f.reason)}</span></li>`).join('');
    return `<div class="acard">${head}<div class="abig num">${a.pools} pools</div>
      <ul class="feed">${feed || `<li><span class="sec">Listening for graduations</span><span></span></li>`}</ul>
      <div class="afoot">${a.waiting} in the waiting room</div></div>`;
  }
  if (a.name === 'auditor') {
    const L = (a.last && a.last.layers) || [], by = {}; L.forEach(l => by[l.layer] = l);
    const strips = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `<div class="strip ${by[n] ? (by[n].pass ? 'ok' : 'bad') : ''}">${n}</div>`).join('');
    const red = L.find(l => !l.pass), done = L.length === 8 && !red;
    const line = !a.last ? 'No coin taken apart yet' : red ? esc(red.value_text) : done ? '8/8 → Executor' : 'taking apart...';
    return `<div class="acard">${head}<div class="abig num">${a.taken_apart} taken apart</div>
      <div class="strips">${strips}</div><div>${a.last ? esc(a.last.name) + ' · ' : ''}${line}</div>
      <div class="afoot">${a.rejected} rejected</div></div>`;
  }
  if (a.name === 'analyst') {
    const v = a.last;
    return `<div class="acard">${head}<div class="sec">Scoring</div><canvas class="ring" id="ring"></canvas>
      <div style="text-align:center">${v ? esc(v.name) + (v.pass ? ' · passed' : ' · ' + esc(v.reason || '')) : 'Nothing scored yet'}</div></div>`;
  }
  if (a.name === 'executor') {
    const s = a.last;
    const filled = s && s.status === 'bought';
    return `<div class="acard">${head}<div class="abig num">${a.trades} trades</div>
      <div>${s && s.size_usd ? money(s.size_usd) + ' · ' + (s.stack_pct ?? a.stack_pct) + '% of stack' : a.stack_pct + '% of stack'}</div>
      <div class="bar"><i id="exec-bar" style="width:${filled ? 100 : 0}%"></i></div>
      <div class="${filled ? 'green' : 'sec'}">${!s ? 'Waiting for a coin' : filled ? '✓ Filled · ' + esc(s.name) : 'Skipped · ' + esc(s.reason || '')}</div></div>`;
  }
  const ex = a.last_exit;
  return `<div class="acard">${head}<div class="abig">${a.open ? 'Guarding' : ex ? (ex.exit_reason === 'stop' ? 'Stopped' : ex.exit_reason === 'trail' ? 'Trailed out' : 'Out · ' + esc(ex.exit_reason)) : 'Guarding'}</div>
    <div>${a.open} open${ex ? ' · last ' + esc(ex.name) + ' ' + money(ex.pnl_usd) : ''}</div>
    <div class="pills"><span class="tpill r">stop -${a.stop_pct}%</span><span class="tpill g">trail ${a.trail_pct}%</span></div></div>`;
}
function renderHome() {
  const s = S;
  odometer($('bal'), money(s.balance));
  const tp = s.today_pct; $('today').textContent = (tp >= 0 ? '+' : '') + tp.toFixed(2) + '%'; $('today').className = 'num ' + (tp >= 0 ? 'green' : 'red');
  $('mult').textContent = s.multiplier.toFixed(2) + '×';
  const n = s.agents.filter(a => a.running && !a.paused).length; $('running-n').textContent = `· ${n} running`;
  const scroll = $('carousel').scrollLeft;
  $('carousel').innerHTML = s.agents.map(card).join(''); $('carousel').scrollLeft = scroll;
  const an = s.agents.find(a => a.name === 'analyst'); const rc = $('ring');
  if (rc) Charts.ring(rc, an.last ? an.last.score : null, settingsMeta ? settingsMeta.values['analyst.min_score'] : 70);
}
async function loadChart() {
  try {
    const d = await api('/api/chart?range=' + range);
    const has = Charts.line($('home-chart'), d, chartLen); chartLen = d.points.length;
    $('chart-empty').classList.toggle('hidden', has && d.marks.length > 0 || d.points.length > 1 && d.marks.length > 0);
    if (!d.marks.length) $('chart-empty').classList.remove('hidden');
  } catch (e) {}
}
$('ranges').querySelectorAll('button').forEach(b => b.onclick = () => {
  range = b.dataset.r; chartLen = 0;
  $('ranges').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); loadChart();
});
async function loadHomeActivity() {
  try {
    const rows = await api('/api/activity');
    $('home-activity').innerHTML = rows.length ? rows.slice(0, 5).map(activityRow).join('') : '<div class="empty">Nothing yet tonight</div>';
    bindRows($('home-activity'));
  } catch (e) {}
}

// ---------- Agents tab ----------
async function renderAgentsTab() {
  if (!S) return;
  const root = $('agents-list');
  if (!root.children.length) root.innerHTML = S.agents.map(() => '<div class="skel-block" style="height:180px"></div>').join('');
  const decs = await Promise.all(S.agents.map(a => api(`/api/agents/${a.name}/decisions`).catch(() => [])));
  const riskLocked = S.open.length > 0;
  root.innerHTML = S.agents.map((a, i) => {
    const rows = decs[i].map(d => {
      const verdict = d.verdict || (d.ok === 0 ? 'red' : d.ok === 1 ? '8/8' : d.pass === 1 ? 'pass' : d.pass === 0 ? 'reject' : d.status || d.reason || '');
      const why = d.reason && d.reason !== verdict ? d.reason : (d.score != null ? 'score ' + d.score : d.pnl_usd != null ? money(d.pnl_usd) : '');
      return `<div class="item"><span class="sec num" style="width:46px">${hhmm(d.ts)}</span>
        <span class="tx"><b><a href="${esc(d.coin_url)}" target="_blank" rel="noopener" class="blue">${esc(d.name)}</a></b><span>${esc(verdict)}</span></span>
        <span class="val sec">${esc(why)}</span></div>`;
    }).join('') || '<div class="empty">' + (a.name === 'scanner' ? 'Listening for graduations' : 'No decisions yet') + '</div>';
    const locked = a.name === 'risk' && riskLocked;
    return `<div class="fcard"><div class="fhead"><span class="sdot ${a.paused ? 'off' : a.running ? '' : 'down'}"></span>
      <b style="color:${COLORS[a.name]}">${NAMES[a.name]}</b><span class="cnt num">${a.today} today</span>
      <label class="switch" title="${locked ? 'Locked while a position is open' : 'pause / resume'}"><input type="checkbox" data-agent="${a.name}" ${a.paused ? '' : 'checked'} ${locked ? 'disabled' : ''}><i></i></label></div>
      <div class="dec list">${rows}</div>
      <button class="linkbtn tap" data-settings="${a.name}">Settings</button></div>`;
  }).join('');
  root.querySelectorAll('input[data-agent]').forEach(inp => inp.onchange = async () => {
    try { await api(`/api/agents/${inp.dataset.agent}/${inp.checked ? 'resume' : 'pause'}`, {method: 'POST'}); toast(`${NAMES[inp.dataset.agent]} ${inp.checked ? 'resumed' : 'paused'}`); refresh(); }
    catch (e) { inp.checked = !inp.checked; toast(e.message); }
  });
  root.querySelectorAll('[data-settings]').forEach(b => b.onclick = () => { go('account'); setTimeout(() => { const el = $('set-' + b.dataset.settings); if (el) el.scrollIntoView(); }, 300); });
}

// ---------- Activity tab ----------
let actBefore = null;
async function loadActivity(reset) {
  if (reset) { actBefore = null; $('activity-list').innerHTML = '<div class="skel-block"></div><div class="skel-block"></div>'; }
  try {
    const rows = await api('/api/activity' + (actBefore ? '?before=' + actBefore : ''));
    const html = rows.map(activityRow).join('');
    if (reset) $('activity-list').innerHTML = html || '<div class="empty">Nothing yet tonight</div>';
    else $('activity-list').insertAdjacentHTML('beforeend', html);
    if (rows.length) actBefore = rows[rows.length - 1].ts;
    $('activity-more').classList.toggle('hidden', rows.length < 30);
    bindRows($('activity-list'));
  } catch (e) {}
}
$('activity-more').onclick = () => loadActivity(false);

// ---------- Coin screen ----------
let coinMint = null;
async function openCoin(mint) {
  coinMint = mint; openScreen('screen-coin');
  ['coin-name', 'coin-price'].forEach(id => $(id).classList.add('skel'));
  await renderCoin();
}
async function renderCoin() {
  if (!coinMint) return;
  let d; try { d = await api('/api/coin/' + coinMint); } catch (e) { return; }
  ['coin-name', 'coin-price'].forEach(id => $(id).classList.remove('skel'));
  const c = d.coin || {}, p = d.position, open = p && !p.closed_at;
  $('coin-name').textContent = d.name;
  $('coin-sub').textContent = `${c.symbol || d.mint.slice(0, 6)} · Solana · ${age(c.migrated_at)} old`;
  $('coin-shield').textContent = d.shield || '—';
  const last = d.prices.length ? d.prices[d.prices.length - 1].price : (d.market && d.market.price);
  $('coin-price').textContent = price(last);
  if (p && last) { const pc = 100 * (last / p.entry_price - 1); $('coin-since').innerHTML = `<span class="${pc >= 0 ? 'green' : 'red'}">${pc >= 0 ? '▲' : '▼'} ${Math.abs(pc).toFixed(2)}% since entry</span>`; }
  else $('coin-since').textContent = '';
  const has = Charts.candles($('coin-chart'), d.prices, d.exit ? d.exit.exit_line : null, p ? p.entry_price : null);
  $('coin-chart-empty').classList.toggle('hidden', has);
  const mk = d.market || {};
  $('st-mcap').textContent = usdK(mk.mcap); $('st-liq').textContent = usdK(mk.liq); $('st-vol').textContent = usdK(mk.vol24);
  $('st-hold').textContent = c.holders != null ? c.holders.toLocaleString() : 'n/a';
  $('coin-pos').classList.toggle('hidden', !open); $('coin-exit').classList.toggle('hidden', !open);
  if (open) {
    $('coin-pos').innerHTML = `<div class="kv"><span>Your position</span><b>${money(p.size_usd)} in · Executor</b></div>
      <div class="kv"><span class="sec">Entry</span><span class="num">${price(p.entry_price)}</span></div>`;
    const e = d.exit, left = Math.max(0, e.timeout_at - Date.now() / 1000);
    $('coin-exit').innerHTML = `<div class="kv"><span class="red">Stop -${p.stop_pct}%</span><span class="num">${price(e.stop_price)}</span></div>
      <div class="kv"><span class="green">Trail ${S ? S.risk.trail_pct : ''}%</span><span class="num">${e.trail_line ? price(e.trail_line) : 'arms at ' + price(e.trail_arms_at)}</span></div>
      <div class="kv"><span class="sec">Timeout in</span><span class="num">${Math.floor(left / 3600)}h ${Math.floor(left % 3600 / 60)}m</span></div>`;
  }
  const btn = $('coin-btn'); btn.textContent = open ? 'Sell on FOMO' : 'Buy on FOMO'; btn.href = d.coin_url;
  btn.style.background = open ? 'var(--r)' : 'var(--g)'; btn.style.color = open ? '#fff' : '#000';
}

// ---------- Auditor screen (8 discs, cyan beam 350ms per layer, then 150ms to green/red) ----------
const LAYER_NAMES = ['Mint authority', 'Freeze authority', 'Dev wallet', 'Top 10 holders', 'Liquidity', 'Pool age', 'Bundled wallets', 'Delegations'];
let auditMint = null, beamQueue = [], beamBusy = false, shown = {};
function discsMarkup() {
  return LAYER_NAMES.map((n, i) => `<div class="disc na" id="disc-${i + 1}" style="top:${i * 25}px;z-index:${10 - i}">${i + 1}</div>`).join('') + '<div class="beam" id="beam"></div>';
}
async function openAudit(mint) {
  auditMint = mint; shown = {}; beamQueue = []; openScreen('screen-audit');
  $('discs').innerHTML = discsMarkup(); $('audit-rows').innerHTML = ''; $('audit-verdict').innerHTML = '';
  let d; try { d = await api('/api/audit/' + mint); } catch (e) { return; }
  $('audit-name').textContent = d.name; $('audit-btn').href = d.coin_url;
  $('auditor-enabled').checked = !!d.enabled;
  if (!d.layers.length) { $('audit-rows').innerHTML = '<div class="empty">No coin taken apart yet</div>'; return; }
  d.layers.forEach(l => queueLayer(l));
  finishVerdict(d);
}
function queueLayer(l) { if (shown[l.layer]) return; shown[l.layer] = true; beamQueue.push(l); runBeam(); }
async function runBeam() {
  if (beamBusy) return; beamBusy = true;
  const beam = $('beam');
  while (beamQueue.length) {
    const l = beamQueue.shift(), disc = $('disc-' + l.layer);
    if (!disc) continue;
    if (!reduced()) { beam.style.opacity = 1; beam.style.top = ((l.layer - 1) * 25 + 17) + 'px'; await new Promise(r => setTimeout(r, 350)); }
    disc.classList.remove('na'); disc.classList.add(l.pass ? 'ok' : 'bad'); disc.textContent = l.pass ? '✓' : '✕';
    if (!reduced()) await new Promise(r => setTimeout(r, 150));
    $('audit-rows').insertAdjacentHTML('beforeend', `<div class="item"><span class="ic ${l.pass ? 'sold' : 'stopped'}">${l.layer}</span>
      <span class="tx"><b>${esc(l.name)}</b><span>${esc(l.source || '')}</span></span><span class="val ${l.pass ? 'green' : 'red'}">${esc(l.value_text ?? l.value)}</span></div>`);
  }
  beam.style.opacity = 0; beamBusy = false;
}
function finishVerdict(d) {
  const red = d.layers.find(l => !l.pass);
  const notChecked = red ? LAYER_NAMES.slice(red.layer).map((n, i) => `<div class="item"><span class="ic rejected">${red.layer + i + 1}</span><span class="tx"><b>${n}</b></span><span class="val ter">not checked</span></div>`).join('') : '';
  const wait = () => beamBusy || beamQueue.length ? setTimeout(wait, 100) : (() => {
    $('audit-rows').insertAdjacentHTML('beforeend', notChecked);
    $('audit-verdict').innerHTML = red
      ? `<b class="red">Rejected · ${esc(red.value_text)}</b><span>Grok Bot won't buy ${esc(d.name)}</span>`
      : d.layers.length === 8 ? `<b class="green">Cleared · 8/8 parts</b><span>Sent to Executor${d.sent_usd ? ' · ' + money(d.sent_usd) : ''}</span>` : '<span>taking apart...</span>';
  })();
  wait();
}
$('auditor-enabled').onchange = async e => {
  const on = e.target.checked;
  if (!on && !(confirm('Turn off "Take apart before buying"? Coins would skip all 8 safety layers.') && confirm('Are you sure? Every coin goes to Analyst without an audit.'))) { e.target.checked = true; return; }
  try { await api('/api/settings', {method: 'POST', body: JSON.stringify({key: 'auditor.enabled', value: on})}); toast('Auditor ' + (on ? 'on' : 'off')); }
  catch (err) { e.target.checked = !on; toast(err.message); }
};

// ---------- Search + bell ----------
$('btn-search').onclick = () => { openScreen('screen-search'); $('search-q').focus(); };
let sq = null;
$('search-q').oninput = () => { clearTimeout(sq); sq = setTimeout(async () => {
  const q = $('search-q').value.trim(); if (!q) { $('search-res').innerHTML = ''; return; }
  const rows = await api('/api/search?q=' + encodeURIComponent(q)).catch(() => []);
  $('search-res').innerHTML = rows.length ? rows.map(r => `<button class="item tap" style="width:100%;text-align:left" data-mint="${esc(r.mint)}" data-kind="${r.status === 'rejected' ? 'rejected' : 'coin'}">
    <span class="ic rejected">${esc((r.symbol || r.name || '?').slice(0, 2))}</span><span class="tx"><b>${esc(r.name || r.mint.slice(0, 8))}</b><span>${esc(r.symbol || '')} · ${esc(r.status)}</span></span></button>`).join('')
    : '<div class="empty">No coin found. Send the mint.</div>';
  bindRows($('search-res'));
}, 250); };
$('btn-bell').onclick = async () => {
  openScreen('screen-bell'); localStorage.setItem('desk_seen', String(Date.now() / 1000)); $('bell-dot').classList.add('hidden');
  const rows = await api('/api/notifications').catch(() => []);
  $('bell-list').innerHTML = rows.length ? rows.map(r => `<div class="item"><span class="tx"><b>${esc(r.text.split('\n')[0])}</b><span>Grok Bot · ${hhmm(r.ts)}</span></span>
    ${r.buttons && r.buttons[0] ? `<a class="linkbtn tap" style="display:grid;place-items:center" href="${esc(r.buttons[0].url)}" target="_blank" rel="noopener">${esc(r.buttons[0].text)}</a>` : ''}</div>`).join('')
    : '<div class="empty">No pushes yet</div>';
};
async function checkBell() {
  const seen = +(localStorage.getItem('desk_seen') || 0);
  const rows = await api('/api/notifications?since=' + seen).catch(() => []);
  $('bell-dot').classList.toggle('hidden', !rows.length);
}

// ---------- Account ----------
const GROUPS = ['scanner', 'auditor', 'analyst', 'executor', 'risk', 'desk'];
async function loadAccount() {
  try {
    const [acct, st] = await Promise.all([api('/api/account'), api('/api/settings')]);
    settingsMeta = st;
    $('acct-stack').textContent = money(acct.stack) + ' · start ' + money(acct.paper_start_stack);
    $('acct-handle').textContent = acct.fomo_handle ? '@' + acct.fomo_handle : 'not set';
    if (acct.profile_url) $('acct-profile').href = acct.profile_url; else $('acct-profile').removeAttribute('href');
    $('acct-notify').textContent = acct.telegram ? 'Telegram' : acct.web_push ? 'Web push' : 'File log (no Telegram yet)';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    $('btn-enable-push').classList.toggle('hidden', !(standalone && acct.web_push));
    $('settings').innerHTML = GROUPS.map(g => `<div class="gtitle" id="set-${g}">${g === 'desk' ? 'Desk' : NAMES[g]}${g === 'analyst' ? ' (rules)' : ''}</div><div class="group">` +
      Object.keys(st.values).filter(k => k.startsWith(g + '.')).map(k => setRow(k, st.values[k], st.meta[k])).join('') + '</div>').join('');
    $('settings').querySelectorAll('[data-k]').forEach(bindSetting);
    const sl = S ? S.slots : await api('/api/slots');
    $('slots').innerHTML = sl.map(x => `<div class="row"><span>${esc(x.slot)} · <span class="sec">${esc(x.repo)}</span></span><span class="${x.on ? 'green' : 'sec'}">${x.on ? 'ON' : 'OFF'}</span></div>`).join('');
  } catch (e) {}
}
function setRow(k, v, meta) {
  const name = k.split('.')[1];
  if (typeof v === 'boolean') return `<div class="setrow"><div class="sk"><span>${name}</span><label class="switch"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''} ${k === 'auditor.enabled' ? 'data-twice="1"' : ''}><i></i></label></div></div>`;
  if (typeof v === 'number' && meta && meta.min != null) {
    const step = Number.isInteger(meta.default) && Number.isInteger(meta.max) ? 1 : (meta.max - meta.min) / 200;
    return `<div class="setrow"><div class="sk"><span>${name}</span><span class="ter num">${meta.min}–${meta.max}</span></div>
      <div class="sv"><input type="range" min="${meta.min}" max="${meta.max}" step="${step}" value="${v}" data-slider="${k}">
      <input type="number" inputmode="decimal" min="${meta.min}" max="${meta.max}" step="any" value="${v}" data-k="${k}"></div></div>`;
  }
  const locked = k === 'desk.mode' || k === 'desk.notifier';
  return `<div class="setrow"><div class="sk"><span>${name}</span></div><div class="sv"><input type="text" value="${esc(v)}" data-k="${k}" ${locked ? 'disabled' : ''} style="width:100%"></div></div>`;
}
function bindSetting(inp) {
  const k = inp.dataset.k, slider = document.querySelector(`[data-slider="${k}"]`);
  if (slider) slider.oninput = () => { inp.value = slider.value; }, slider.onchange = () => save();
  inp.onchange = () => save();
  async function save() {
    let val = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Number(inp.value) : inp.value;
    if (inp.dataset.twice && val === false && !(confirm('Turn off the Auditor?') && confirm('Really? Coins skip all 8 layers.'))) { inp.checked = true; return; }
    try { const r = await api('/api/settings', {method: 'POST', body: JSON.stringify({key: k, value: val})}); toast(`${k.split('.')[1]} ${r.old} → ${r.new}`); if (slider) slider.value = r.new; }
    catch (e) { toast(e.message); loadAccount(); }
  }
}
$('mode-seg').querySelectorAll('button').forEach(b => b.onclick = async () => {
  if (b.dataset.m === 'LIVE') {
    const typed = prompt('Type LIVE to confirm');
    if (typed !== 'LIVE') return;
    try { await api('/api/mode', {method: 'POST', body: JSON.stringify({mode: 'LIVE', confirm: 'LIVE'})}); }
    catch (e) { toast(e.message); }
  }
});
$('btn-testpush').onclick = async () => { try { await api('/api/test_push', {method: 'POST'}); toast('Test push written · see the bell'); checkBell(); } catch (e) { toast(e.message); } };

// ---------- data loop: SSE for live events, polling as the safety net ----------
let refreshing = false, again = false;
async function refresh() {
  if (refreshing) { again = true; return; }
  refreshing = true;
  try {
    S = await api('/api/state'); lastOk = Date.now(); failN = 0; retryAt = 0; $('offline').classList.add('hidden');
    if (PLANB && B && B.generated_at) { const n = $('planb-time'); if (n) n.textContent = new Date(B.generated_at * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}); }
    renderHome(); loadChart(); loadHomeActivity(); checkBell();
    if (!$('screen-coin').classList.contains('hidden')) renderCoin();
    if (!$('tab-agents').classList.contains('hidden')) renderAgentsTab();
    document.querySelectorAll('.paper-only').forEach(el => el.classList.toggle('hidden', S.mode !== 'PAPER'));
  } catch (e) {
    if (e.message !== '401') { failN++; retryAt = Date.now() + Math.min(30, 2 ** failN) * 1000; offlineTick(); }
  } finally { refreshing = false; if (again) { again = false; setTimeout(refresh, 300); } }
}
let deb = null; const soon = () => { clearTimeout(deb); deb = setTimeout(refresh, 400); };
function stream() {
  if (PLANB || !window.EventSource || !TOKEN) return;
  const es = new EventSource('/api/stream?t=' + encodeURIComponent(TOKEN));
  ['scan', 'audit', 'verdict', 'signal', 'fill', 'exit', 'balance'].forEach(k => es.addEventListener(k, soon));
  es.addEventListener('audit_layer', ev => {
    const l = JSON.parse(ev.data);
    if (auditMint === l.mint && !$('screen-audit').classList.contains('hidden')) queueLayer({layer: l.n, name: l.name, pass: l.pass, value_text: l.value, source: l.source});
  });
  es.addEventListener('audit', ev => { const d = JSON.parse(ev.data); if (auditMint === d.mint) setTimeout(() => openAuditRefresh(d.mint), 50); soon(); });
  es.onerror = () => { es.close(); setTimeout(stream, 5000); };
}
async function openAuditRefresh(mint) { const d = await api('/api/audit/' + mint).catch(() => null); if (d) finishVerdict(d); }
function tick() { refresh(); setTimeout(() => retryAt && Date.now() < retryAt ? null : null, 0); }
setInterval(() => { if (!retryAt || Date.now() >= retryAt) refresh(); }, PLANB ? 30000 : 15000);
addEventListener('resize', () => { chartLen = 0; if (S) { renderHome(); loadChart(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
if (PLANB) {
  document.body.classList.add('planb');
  const n = $('planb-note'); if (n) n.classList.remove('hidden');
} else if (!TOKEN) showOffline('Not signed in · open the desk link with #t= once');
api('/api/settings').then(st => settingsMeta = st).catch(() => {});
refresh(); stream();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

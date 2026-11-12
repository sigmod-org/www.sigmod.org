// Builds previews of every page with a fake backend, so the UI can be checked
// in a browser without deploying. Output: dev/out/
//   apps-script/*.html  pages as Apps Script serves them (google.script.run)
//   site/*.html         pages as sigmod.org serves them (fetch to the JSON API)
//   node award-nominations/dev/build-preview.mjs && python3 -m http.server 8087 -d award-nominations/dev/out
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'apps-script');
const out = path.join(here, 'out');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'apps-script'), { recursive: true });
fs.mkdirSync(path.join(out, 'site'), { recursive: true });
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(read('Config.gs') + '\n' + read('Shared.gs') +
  '\nthis.CONFIG = CONFIG; this.AWARDS = AWARDS; this.AWARD_ORDER = AWARD_ORDER; this.cycleFor = cycleFor;', ctx);
const cycle = ctx.cycleFor(new Date());
const days = (n) => new Date(Date.now() - n * 86400000).toISOString();

const nomination = (status) => ({
  id: cycle + '-004', award: 'mentorship', status, title: 'Ada Example', firstCycle: cycle, lastCycle: cycle + 2,
  source: 'web', nominator: { name: 'Grace Sample', email: 'grace@example.edu', affiliation: 'Example University' },
  fields: { nomineeName: 'Ada Example', nomineeEmail: 'ada@example.org', nomineeAffiliation: 'Institute of Data' },
  files: ['statement'],
  endorsers: status === 'unconfirmed' ? [
    { id: 'L1', name: 'Alan Former', email: 'alan@example.com', affiliation: 'Data Corp', relationship: 'Former PhD student', nonSupervisee: false, status: 'invited' },
    { id: 'L2', name: 'Edsger Peer', email: 'edsger@example.net', affiliation: 'Tech University', relationship: 'Workshop co-organizer', nonSupervisee: true, status: 'invited' },
    { id: 'L3', name: 'Barbara Busy', email: 'barbara@example.org', affiliation: 'Lab West', relationship: 'Postdoc mentee', nonSupervisee: false, status: 'invited' }
  ] : [
    { id: 'L1', name: 'Alan Former', email: 'alan@example.com', affiliation: 'Data Corp', relationship: 'Former PhD student',
      nonSupervisee: false, status: 'submitted', invitedAt: days(20), submittedAt: days(4) },
    { id: 'L2', name: 'Edsger Peer', email: 'edsger@example.net', affiliation: 'Tech University', relationship: 'Co-organizer of a mentoring workshop',
      nonSupervisee: true, status: 'invited', invitedAt: days(20) },
    { id: 'L3', name: 'Barbara Busy', email: 'barbara@example.org', affiliation: 'Lab West', relationship: 'Postdoc mentee',
      nonSupervisee: false, status: 'declined', invitedAt: days(20), declineReason: 'Traveling until March, sorry.' }
  ]
});
const endorsement = {
  award: 'codd', title: 'Ada Example', files: ['statement', 'cv'],
  nominator: { name: 'Grace Sample', affiliation: 'Example University' },
  fields: { nomineeName: 'Ada Example', nomineeEmail: 'ada@example.org', nomineeAffiliation: 'Institute of Data',
    citation: 'For pioneering adaptive indexing techniques that let data systems tune themselves to the workload.',
    description: 'Lorem ipsum '.repeat(70).trim() },
  me: { name: 'Edsger Peer', status: 'invited', submittedAt: '', hasLetter: false }
};

// The fake API: same functions and answers as Code.gs, in memory.
const api = `
var MOCK = (function () {
  var noms = { unconfirmed: ${JSON.stringify(nomination('unconfirmed'))}, active: ${JSON.stringify(nomination('active'))} };
  var end = ${JSON.stringify(endorsement)}, seq = 10, cur = null;
  function nom(t) { cur = noms[t] || noms.active; return cur; }
  return {
    apiBoot: function (p) {
      var b = { cycle: ${cycle}, view: 'home' };
      if (p.n === 'bad' || p.e === 'bad') return { cycle: ${cycle}, view: 'error', message: 'This link is not valid.' };
      if (p.n) { b.view = 'status'; b.nomination = nom(p.n); b.token = p.n; }
      if (p.e) { b.view = 'endorse'; b.endorsement = end; b.token = p.e; }
      return b;
    },
    apiUpload: function () { return { id: 'staged-' + (seq++) }; },
    apiSubmitNomination: function (p) { console.log('apiSubmitNomination', p); return { ok: true, id: '${cycle}-012' }; },
    apiConfirm: function (t) { var n = nom(t); n.status = 'active'; n.endorsers.forEach(function (e) { e.invitedAt = new Date().toISOString(); }); return { ok: true, nomination: n }; },
    apiUpdateNomination: function (t, p) { var n = nom(t); Object.assign(n.fields, p.fields); return { ok: true, nomination: n }; },
    apiAddEndorser: function (t, e) { var n = nom(t); n.endorsers.push(Object.assign({ id: 'L' + (seq++), status: 'invited', invitedAt: new Date().toISOString() }, e)); return { ok: true, nomination: n }; },
    apiRemoveEndorser: function (t, id) { var n = nom(t); n.endorsers = n.endorsers.filter(function (e) { return e.id !== id; }); return { ok: true, nomination: n }; },
    apiResendInvite: function () { return { ok: true }; },
    apiWithdraw: function (t) { var n = nom(t); n.status = 'withdrawn'; return { ok: true, nomination: n }; },
    apiGetFile: function () { throw new Error('Downloads are not available in the preview.'); },
    apiSubmitEndorsement: function () { end.me.status = 'submitted'; end.me.submittedAt = new Date().toISOString(); return { ok: true, endorsement: end }; },
    apiDeclineEndorsement: function () { end.me.status = 'declined'; return { ok: true, endorsement: end }; }
  };
})();`;

const scriptRunMock = `<script>${api}
window.PREVIEW_LINK = function (p) { return p.award ? 'nominate-' + p.award + '.html' : 'index.html'; };
(function () {
  function runner() {
    var ok = function () {}, fail = function () {};
    var r = new Proxy({}, { get: function (_, k) {
      if (k === 'withSuccessHandler') return function (f) { ok = f; return r; };
      if (k === 'withFailureHandler') return function (f) { fail = f; return r; };
      return function () { var a = arguments; setTimeout(function () {
        try { ok(JSON.parse(JSON.stringify(MOCK[k].apply(null, a)))); } catch (e) { fail(e); } }, 400); };
    } });
    return r;
  }
  window.google = { script: {} };
  Object.defineProperty(window.google.script, 'run', { get: runner });
})();
</script>`;

// Static mode: intercept fetch() to the API URL and answer like doPost does.
const fetchMock = `<script>${api}
window.fetch = function (url, opts) {
  var req = JSON.parse(opts.body), out;
  try { out = { result: JSON.parse(JSON.stringify(MOCK[req.fn].apply(null, req.args))) }; } catch (e) { out = { error: e.message }; }
  console.log('POST', url, req.fn, opts.headers['Content-Type']);
  return new Promise(function (res) { setTimeout(function () { res({ ok: true, status: 200, json: function () { return Promise.resolve(out); } }); }, 400); });
};
</script>`;

// Apps Script pages
function appsScriptPage(file, boot) {
  boot = Object.assign({ baseUrl: 'index.html', cycle, token: 'active' }, boot);
  const html = read('App.html')
    .replace("<?!= include('Styles'); ?>", read('Styles.html'))
    .replace('<?!= sharedSource(); ?>', read('Config.gs') + '\n' + read('Shared.gs'))
    .replace('<?!= bootstrap ?>', JSON.stringify(boot).replace(/</g, '\\u003c'))
    .replace("<?!= include('Client'); ?>", scriptRunMock + read('Client.html'));
  fs.writeFileSync(path.join(out, 'apps-script', file), html);
}
appsScriptPage('index.html', { view: 'home' });
for (const k of ctx.AWARD_ORDER) appsScriptPage('nominate-' + k + '.html', { view: 'nominate', award: k });
appsScriptPage('status.html', { view: 'status', nomination: nomination('active') });
appsScriptPage('endorse.html', { view: 'endorse', endorsement });

// sigmod.org page (static), with the site's stylesheets if the site repo is next door
const pub = Object.assign({}, ctx.CONFIG, { apiUrl: 'https://script.google.com/macros/s/PREVIEW/exec' });
const js = '(function () {\nvar CONFIG = ' + JSON.stringify(pub) + ';\nvar AWARDS = ' + JSON.stringify(ctx.AWARDS) +
  ';\nvar AWARD_ORDER = ' + JSON.stringify(ctx.AWARD_ORDER) + ';\n' + read('Shared.gs') + '\n' +
  read('Client.html').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '') + '\n})();';
const siteCss = ['site.css', 'content.css'].map((f) => path.join(here, '..', '..', 'src', 'assets', f))
  .filter(fs.existsSync).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
fs.writeFileSync(path.join(out, 'site', 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Nominate for a SIGMOD Award</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap" rel="stylesheet">
<style>${siteCss}</style><style>${read('Styles.html').replace(/<\/?style>/g, '')}</style></head><body>
<header class="hdr"><div class="wrap hdr-in"><b>ACM SIGMOD (site header)</b></div></header>
<div class="page-head"><div class="wrap"><p class="crumbs"><a href="/">Home</a><span>/</span><a href="#">Awards</a></p>
<h1 data-nom-title>Nominate for a SIGMOD Award</h1></div></div>
<div class="wrap" style="max-width:900px;padding-top:32px;padding-bottom:80px"><div id="app" class="nom" aria-live="polite"></div></div>
${fetchMock}<script>${js}</script></body></html>`);
console.log('Wrote previews to', out, '— site page: site/index.html?award=codd | ?n=unconfirmed | ?n=active | ?e=x | ?n=bad');

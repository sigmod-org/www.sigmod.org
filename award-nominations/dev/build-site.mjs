// Generates the browser side of the nomination forms from the Apps Script
// sources (award-nominations/apps-script/):
//   src/assets/nominate.js   public config + shared validation + page code
//   src/assets/nominate.css  form styles (scoped to .nom)
// The Eleventy build calls this before every build (see eleventy.config.js),
// so the two files are never edited or committed by hand (.gitignore).
// The page that loads them is src/content/pages/sigmod-awards/nominate/index.njk.
//   node award-nominations/dev/build-site.mjs     (also works on its own)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appsScript = path.join(here, '..', 'apps-script');
const siteAssets = path.join(here, '..', '..', 'src', 'assets');

export function buildNominationAssets(outDir = siteAssets) {
  const read = (f) => fs.readFileSync(path.join(appsScript, f), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('Config.gs') + '\nthis.CONFIG = CONFIG; this.AWARDS = AWARDS; this.AWARD_ORDER = AWARD_ORDER;', ctx);
  const C = ctx.CONFIG;
  // Only what the browser needs.
  const pub = { org: C.org, deadline: C.deadline, maxUploadMB: C.maxUploadMB, callUrl: C.callUrl,
    awardsUrl: C.awardsUrl, replyTo: C.replyTo, apiUrl: C.apiUrl, eligibilityRule: C.eligibilityRule,
    officersUrl: C.officersUrl, committeeUrl: C.committeeUrl, coiUrl: C.coiUrl };

  const banner = '/* Generated at build time by award-nominations/dev/build-site.mjs from award-nominations/apps-script/. Do not edit. */\n';
  const js = banner + '(function () {\n' +
    'var CONFIG = ' + JSON.stringify(pub) + ';\n' +
    'var AWARDS = ' + JSON.stringify(ctx.AWARDS) + ';\n' +
    'var AWARD_ORDER = ' + JSON.stringify(ctx.AWARD_ORDER) + ';\n' +
    read('Shared.gs') + '\n' +
    read('Client.html').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '') +
    '\n})();\n';
  const css = banner + read('Styles.html').replace(/^\s*<style>/, '').replace(/<\/style>\s*$/, '');

  // Write only when something changed, so `eleventy --serve` doesn't rebuild in a loop.
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [name, body] of [['nominate.js', js], ['nominate.css', css]]) {
    const file = path.join(outDir, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== body) {
      fs.writeFileSync(file, body);
      written.push(name);
    }
  }
  return { written, apiUrl: pub.apiUrl };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = buildNominationAssets();
  console.log((r.written.length ? 'Wrote ' + r.written.join(', ') : 'Up to date') + ' in ' + siteAssets +
    (r.apiUrl ? '' : ' (no apiUrl: page shows "open soon")'));
}

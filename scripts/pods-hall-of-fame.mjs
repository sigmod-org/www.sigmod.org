#!/usr/bin/env node
// Builds the PODS Hall of Fame data (src/_data/podsHallOfFame.json) from dblp.
// Runs every two months from .github/workflows/pods-hall-of-fame.yml, which commits the result
// and publishes the site; the site build itself only reads the committed JSON.
// Run it by hand with `npm run hall-of-fame`.
//
// What counts as a PODS paper
//   - every authored entry in the PODS proceedings, 1982-2023 (dblp TOCs db/conf/pods/podsNN)
//   - since 2024, the PODS issues of PACMMOD (Proc. ACM Manag. Data), which dblp tags with the
//     PODS stream, plus the PODS Companion volumes (keynotes, tutorials: db/conf/pods/podsNNNNc),
//     the same kinds of invited papers the proceedings carried before 2024
//   - not the proceedings volumes themselves, the Test-of-Time award notices, obituaries,
//     forewords, errata or the PACMMOD issue editorials (see NOT_A_PAPER)
//   - not the workshops dblp also files under the PODS stream (GRADES, ExploreDB, the SIGMOD PhD
//     Symposium): only entries listed on PODS or PACMMOD tables of contents are kept
//
// Years are conference years. PACMMOD has two PODS issues a year: issue 2 (about May) goes with
// that year's PODS and issue 5 (about November) with the next year's, so a paper in an issue
// numbered 4 or higher is counted one year later than dblp's publication year.
//
// People are counted by dblp person id, so name variants a person has in dblp count together.
//
// If dblp cannot be reached, or the new data look wrong (a year without papers, or far fewer
// papers than the last run), the script keeps the existing JSON and exits 0. With --strict (as the
// scheduled workflow runs it) it exits 1 instead, so the run fails visibly and commits nothing.
//
// Usage: node scripts/pods-hall-of-fame.mjs [--strict] [--dry-run]

import { readFile, writeFile } from "node:fs/promises";

// dblp's web pages and search API sit behind a bot check; its SPARQL endpoint is meant for scripts.
const ENDPOINT = process.env.DBLP_SPARQL || "https://sparql.dblp.org/sparql";
const OUT = new URL("../src/_data/podsHallOfFame.json", import.meta.url);
const MIN_PAPERS = 10;            // authors with at least this many papers are listed
const FIRST_YEAR = 1982;          // first PODS
const MIN_SHARE_OF_LAST_RUN = 0.97;
const strict = process.argv.includes("--strict");
const dryRun = process.argv.includes("--dry-run");

const QUERY = `
PREFIX dblp: <https://dblp.org/rdf/schema#>
SELECT ?pub ?toc ?year ?issue ?title ?type ?author ?name WHERE {
  ?pub dblp:publishedInStream <https://dblp.org/streams/conf/pods> ;
       dblp:listedOnTocPage ?toc ;
       dblp:yearOfPublication ?year ;
       dblp:title ?title ;
       dblp:bibtexType ?type ;
       dblp:authoredBy ?author .
  ?author dblp:primaryCreatorName ?name .
  OPTIONAL { ?pub dblp:publishedInJournalVolumeIssue ?issue }
  FILTER(STRSTARTS(STR(?toc), "https://dblp.org/db/conf/pods/")
      || STRSTARTS(STR(?toc), "https://dblp.org/db/journals/pacmmod/"))
}`;

// Authored entries that are not papers: award notices ("test-of-time award" and "test-of-time-award"),
// obituaries, forewords (dblp spells the 2004 one "Forword"), errata and corrigenda, and the
// program chairs' editorial at the front of each PACMMOD PODS issue.
const NOT_A_PAPER = /test-of-time[- ]award|^in memoriam\b|\beditorial\.?$|^(fore?word|preface)\.?$|^(erratum|corrigendum)\b/i;

function warn(msg) {
  console.warn(`pods-hall-of-fame: ${msg}`);
}

async function fetchRows() {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
      "User-Agent": "static-site-build (hall of fame counts)",
    },
    body: new URLSearchParams({ query: QUERY }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`dblp SPARQL returned HTTP ${res.status}`);
  const json = await res.json();
  return json.results.bindings.map((b) => Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, v.value])));
}

// Conference year of an entry, from its TOC page (podsNN, pods20NN, pods20NNc) or its PACMMOD issue.
function conferenceYear(row) {
  const toc = row.toc.split("/").pop();
  const m = toc.match(/^pods(\d{2}|\d{4})c?$/);
  if (m) {
    const y = Number(m[1]);
    return y >= 1000 ? y : y >= 80 ? 1900 + y : 2000 + y;
  }
  if (toc.startsWith("pacmmod")) return Number(row.year) + (Number(row.issue) >= 4 ? 1 : 0);
  return null;
}

// dblp appends " 0001" etc. to tell apart people with the same name.
const displayName = (name) => name.replace(/ \d{4}$/, "");

function decadesFor(lastYear) {
  const decades = [];
  for (let from = FIRST_YEAR; from <= lastYear; from = Math.floor(from / 10) * 10 + 10) {
    const to = Math.floor(from / 10) * 10 + 9;
    const yy = (y) => `’${String(y % 100).padStart(2, "0")}`;
    decades.push({ from, to, label: to < lastYear ? `${yy(from)}–${yy(to)}` : `${yy(from)}–` });
  }
  return decades;
}

function build(rows) {
  const papers = new Map();   // pub -> { year, authors: Set }
  const people = new Map();   // author pid -> name
  const skipped = new Map();
  for (const r of rows) {
    if (r.type.endsWith("#Proceedings") || NOT_A_PAPER.test(r.title)) {
      skipped.set(r.pub, r.title);
      continue;
    }
    const year = conferenceYear(r);
    if (!year) { skipped.set(r.pub, `unknown year: ${r.toc}`); continue; }
    if (!papers.has(r.pub)) papers.set(r.pub, { year, authors: new Set() });
    papers.get(r.pub).authors.add(r.author);
    people.set(r.author, r.name);
  }

  const years = [...papers.values()].map((p) => p.year);
  const lastYear = Math.max(...years);
  const decades = decadesFor(lastYear);
  const byYear = {};
  for (const y of years) byYear[y] = (byYear[y] || 0) + 1;

  const counts = new Map();
  for (const { year, authors } of papers.values()) {
    const d = decades.findIndex((x) => year >= x.from && year <= x.to);
    for (const a of authors) {
      if (!counts.has(a)) counts.set(a, new Array(decades.length).fill(0));
      counts.get(a)[d]++;
    }
  }

  const authors = [...counts]
    .map(([pid, perDecade]) => ({
      name: displayName(people.get(pid)),
      dblp: pid,
      total: perDecade.reduce((s, n) => s + n, 0),
      perDecade,
    }))
    .filter((a) => a.total >= MIN_PAPERS)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    generated: new Date().toISOString().slice(0, 10),
    source: "dblp (sparql.dblp.org)",
    minPapers: MIN_PAPERS,
    papers: papers.size,
    firstYear: FIRST_YEAR,
    lastYear,
    byYear,
    decades,
    authors,
    excluded: [...skipped.values()].filter((t) => !t.startsWith("Proceedings") && !t.startsWith("Companion")).sort(),
  };
}

function problems(data, previous) {
  const out = [];
  for (let y = FIRST_YEAR; y <= data.lastYear; y++) {
    if (!data.byYear[y]) out.push(`no PODS papers found for ${y}`);
  }
  if (previous?.papers && data.papers < previous.papers * MIN_SHARE_OF_LAST_RUN) {
    out.push(`only ${data.papers} papers, down from ${previous.papers} in the last run`);
  }
  if (!data.authors.length) out.push("no authors reach the threshold");
  return out;
}

const previous = await readFile(OUT, "utf8").then(JSON.parse).catch(() => null);
try {
  const data = build(await fetchRows());
  const issues = problems(data, previous);
  if (issues.length) throw new Error(`data look wrong:\n  - ${issues.join("\n  - ")}`);
  if (dryRun) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
    console.log(`pods-hall-of-fame: ${data.papers} papers ${data.firstYear}–${data.lastYear}, ${data.authors.length} authors with ${MIN_PAPERS}+`);
  }
} catch (err) {
  const kept = previous ? `keeping the data from ${previous.generated}` : "and there is no earlier data";
  warn(`${err.message}\n  ${kept}`);
  if (strict || !previous) process.exit(1);
}

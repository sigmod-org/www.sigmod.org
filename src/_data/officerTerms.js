// Turns officers.json (periods -> terms) into the tables on /sigmod-history/officers/.
// Newest first. Each term gives one row with everyone present from the start of the term, then one
// row per year (or dated snapshot) in which someone joins, newest first. Sources are shown as
const colOf = (m) => m.column || column(m.role);
// "Vol(Issue)" links under the term or year. Edit officers.json, not this file.
import { readFileSync } from "node:fs";

const load = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
const PC_FROM = 2020; // SIGMOD PC chairs sit on the EC from 2020 on

const COLUMNS = [
  { key: "officers", title: "Officers", sub: "Chair, Vice-Chair, Secretary/Treasurer" },
  { key: "editor", title: "Record Editor" },
  { key: "info", title: "Information Director" },
  { key: "conf", title: "Conference Coordinator" },
  { key: "pc", title: "SIGMOD PC chairs" },
  { key: "others", title: "Other members" },
];
const OFFICER_ROLES = [["chair", "Chair"], ["viceChair", "Vice-Chair"], ["treasurer", "Secretary/Treasurer"]];
const column = (role = "") =>
  /Information Director|DiSC|Anthology/.test(role) ? "info"
    : /Conference Coordinator/.test(role) ? "conf" : "other";

// "Vol(Issue)" of a source: given as "issue", in the label ("Record 8(1) Jan 1976"), or from a sigmodrecord.org URL
const ISSUE_OF_MONTH = { "03": 1, "06": 2, "09": 3, "12": 4 };
function issueOf(s) {
  if (s.issue) return s.issue;
  const m = s.label.match(/(\d+)\((\d+(?:-\d+)?)\)/);
  if (m) return `${m[1]}(${m[2]})`;
  const u = s.url.match(/sigmodRecord\/(\d\d)(\d\d)\//) || s.url.match(/sigmodrecord\.org\/\d\d(\d\d)\/(\d\d)\//);
  if (u) {
    const year = Number(u[1]) + (Number(u[1]) > 50 ? 1900 : 2000);
    const month = u[2];
    const issue = ISSUE_OF_MONTH[month] ?? Math.ceil(Number(month) / 3);
    return `${year - 1971}(${issue})`;
  }
  return "source";
}
// oldest issue first; the same document once
const issueKey = (l) => { const m = l.text.match(/^(\d+)\((\d+)/); return m ? Number(m[1]) * 10 + Number(m[2]) : 9999; };
const tidy = (links) => links.filter((l, i) => links.findIndex((x) => x.url === l.url) === i).sort((a, b) => issueKey(a) - issueKey(b));
const link = (s, election) => ({ text: issueOf(s), url: s.url, title: (election ? "Election: " : "") + s.label });

// "Sep 1976" or 1974 -> sortable number and label
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sortKey = (w) => {
  if (typeof w === "number") return w;
  const [m, y] = String(w).split(" ");
  return Number(y) + (MONTHS.indexOf(m) + 1) / 100;
};
// someone who did not serve the whole term: (1998–2001), or (2001) for a single year
const yearsOf = (a, b) => (String(a) === String(b) ? String(a) : `${a}–${b}`);
const span = (p, term) => {
  if (p.noYears || (p.from == null && p.to == null && !p.showYears)) return "";
  if (typeof p.to === "string") return `to ${p.to}`; // dated snapshot, e.g. "Jan 1976"
  return yearsOf(p.from ?? term.from, p.to ?? term.to);
};
const describe = (p, { role, term, onTermRow }) => {
  const bits = [role, onTermRow || term.yearRows ? span(p, term) : ""].filter(Boolean);
  return { name: p.name, note: bits.join(", ") };
};
// people who get their own shaded row are grouped by the years they served (from-to)
// With "yearRows" (terms since 2013: a row for every year), everyone
// who did not serve the whole term goes on the row of the year they started, with their years;
// Record editors stay on the term row with their years.
// In "yearRows" terms the PODS chair and TODS EiC are listed on every year's row instead, while the
// Record editor, Information Director and Conference Coordinator stay on the term row with their years.
const TERM_ROW_COLS = ["editor", "info", "conf"];
const rotating = (p, term) => !!term.yearRows && !p.inline && /PODS Chair|TODS EiC/.test(p.role || "");
const servesIn = (p, term, y) => (p.from ?? term.from) <= y && y <= (p.to ?? term.to - 1);
const rowKey = (p, term, isEditor) => {
  if (rotating(p, term)) return "rotating";
  if (p.inline) return null;
  if (term.yearRows) {
    if (isEditor || TERM_ROW_COLS.includes(colOf(p)) || (p.from == null && p.to == null)) return null;
    const y = p.from ?? term.from;
    return `${y}|${y}`;
  }
  return p.from != null ? `${p.from}|${p.to ?? term.to}` : null;
};

// the cells for the people whose row is `key` (null = the term row)
function cells(term, key) {
  const here = (p) => rowKey(p, term, false) === key;
  const onTermRow = key === null;
  const officers = [];
  for (const [k, label] of OFFICER_ROLES)
    for (const p of (term[k] || []).filter(here)) officers.push(describe(p, { role: onTermRow ? "" : label, term, onTermRow }));
  const editor = (term.editor || []).filter((p) => rowKey(p, term, true) === key).map((p) => describe(p, { term, onTermRow }));
  const members = (term.members || []).filter(here);
  // Information Directors first, DiSC and Anthology editors last
  const info = members.filter((m) => colOf(m) === "info")
    .sort((a, b) => (a.role === "Information Director" ? 0 : 1) - (b.role === "Information Director" ? 0 : 1))
    .map((m) => describe(m, { role: m.role === "Information Director" ? "" : m.role, term, onTermRow }));
  const conf = members.filter((m) => colOf(m) === "conf").map((m) => describe(m, { term, onTermRow }));
  const others = members.filter((m) => colOf(m) === "other").map((m) => describe(m, { role: m.role, term, onTermRow }));
  return { officers, editor, info, conf, others };
}

function termRows(term, pcByYear, thisYear) {
  const sources = term.sources || [];
  // shaded rows: one per from-to span of people who joined mid-term, plus one per PC chair year
  const spans = new Map();
  for (const k of ["chair", "viceChair", "treasurer", "editor", "members"])
    for (const p of term[k] || []) {
      const key = rowKey(p, term, k === "editor");
      const num = (v) => (/^\d+$/.test(v) ? Number(v) : v);
      if (key) { const [from, to] = key.split("|").map(num); spans.set(key, { key, from, to }); }
    }
  spans.delete("rotating");
  // yearRows terms get a row for every year so far; others only for PC chair years
  const years = [];
  for (let y = term.yearRows ? term.from : Math.max(term.from, PC_FROM); y <= Math.min(term.to - 1, thisYear); y++)
    if (term.yearRows || pcByYear.has(y)) years.push(y);
  const rows = [...spans.values()].map((r) => ({ ...r, ...cells(term, r.key), pc: [] }));
  for (const y of years) {
    let row = rows.find((r) => String(r.from) === String(y) && String(r.to) === String(y));
    if (!row) rows.push((row = { key: `${y}|${y}`, from: y, to: y, ...cells(term, `${y}|${y}`), pc: [] }));
    if (y >= PC_FROM && pcByYear.has(y)) row.pc = pcByYear.get(y).chairs.map((c) => ({ name: c.name }));
    // PODS chair and TODS EiC serving that year, listed first
    // in a handover year, only the incoming holder of each role
    const start = (p) => p.from ?? term.from;
    const incoming = (list) => list.filter((p) => !list.some((q) => q !== p && q.role === p.role && start(q) > start(p)));
    const serving = (term.members || []).filter((p) => rotating(p, term) && servesIn(p, term, y));
    const rot = incoming(serving)
      .sort((a, b) => (/PODS/.test(a.role) ? 0 : 1) - (/PODS/.test(b.role) ? 0 : 1))
      .map((p) => ({ name: p.name, note: p.role }))
      // one person holding both roles: "Yufei Tao (TODS EiC and PODS Chair)"
      .reduce((out, e) => {
        const prev = out.find((o) => o.name === e.name);
        if (prev) prev.note = [prev.note, e.note].sort((a, b) => (/TODS/.test(a) ? 0 : 1) - (/TODS/.test(b) ? 0 : 1)).join(" and ");
        else out.push(e);
        return out;
      }, []);
    row.others = [...rot, ...row.others];
  }
  // newest first; for the same start, the longer span first
  rows.sort((a, b) => sortKey(b.from) - sortKey(a.from) || sortKey(b.to) - sortKey(a.to));
  // a dated source goes on the first row that starts that year, otherwise on the term row
  const home = (s) => (s.when == null ? null : rows.find((r) => String(r.from) === String(s.when)) || null);
  for (const r of rows) {
    r.kind = "year";
    // a single-year row covers July to June, so it reads 2014–2015
    r.label = typeof r.from === "number" && r.from === r.to ? `${r.from}–${r.from + 1}` : yearsOf(r.from, r.to);
    r.links = tidy(sources.filter((s) => home(s) === r).map((s) => link(s)));
  }
  const main = {
    kind: "term", label: `${term.from}–${term.to}`, inProgress: !!term.inProgress,
    ...cells(term, null),
    pc: [],
    links: tidy([...(term.election || []).map((s) => link(s, true)), ...sources.filter((s) => !home(s)).map((s) => link(s))]),
  };
  // consecutive yearly rows with exactly the same people become one row: 2014–2015 + 2015–2016 -> 2014–2016
  const CELLS = ["officers", "editor", "info", "conf", "pc", "others"];
  const yearly = (r) => typeof r.from === "number" && r.from === r.to;
  const merged = [];
  for (const r of rows) { // newest first
    const prev = merged.at(-1);
    if (prev && yearly(r) && prev.single && prev.lo === r.from + 1 && CELLS.every((k) => JSON.stringify(prev[k]) === JSON.stringify(r[k]))) {
      prev.lo = r.from;
      prev.label = `${prev.lo}–${prev.hi + 1}`;
      prev.links = tidy([...r.links, ...prev.links]);
    } else merged.push(yearly(r) ? { ...r, single: true, lo: r.from, hi: r.from } : r);
  }
  return [main, ...merged];
}

export default function () {
  const data = load("./officers.json");
  const pcByYear = new Map(load("./programChairs.json").map((r) => [r.year, r]));
  const thisYear = new Date().getFullYear();
  return data.periods.slice().reverse().map((period) => {
    const rows = period.terms.slice().reverse().flatMap((term) => termRows(term, pcByYear, thisYear));
    const used = (k) => rows.some((r) => r[k].length);
    return { ...period, first: period.terms[0].from, last: period.terms.at(-1).to,
      issueLabel: period.issueLabel || "Record issue",
      columns: COLUMNS.filter((c) => c.key === "officers" || used(c.key)), rows };
  });
}

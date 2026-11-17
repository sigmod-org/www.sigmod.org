// "Most often recognized" list on /sigmod-distinguished-aes-and-pcs/, computed at build time from
// distinguishedReviewers.json: how many years each person appears (any role), most first.
// Shows the top 10, plus anyone tied with 10th place. Edit the JSON, not this file.
import { readFileSync } from "node:fs";

const TOP = 10;
const { aliases = {}, years } = JSON.parse(readFileSync(new URL("./distinguishedReviewers.json", import.meta.url), "utf8"));

const byName = new Map();
for (const { year, groups } of years) {
  for (const g of groups) {
    for (const raw of g.names) {
      const name = aliases[raw] || raw;
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name).add(year);
    }
  }
}

const surname = (n) => n.split(" ").pop();
const ranked = [...byName]
  .map(([name, ys]) => ({ name, count: ys.size, years: [...ys].sort((a, b) => a - b) }))
  .sort((a, b) => b.count - a.count || surname(a.name).localeCompare(surname(b.name)) || a.name.localeCompare(b.name));

const cutoff = ranked.length > TOP ? ranked[TOP - 1].count : 0;
export default ranked.filter((r) => r.count >= cutoff);

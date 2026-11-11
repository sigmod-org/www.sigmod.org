# Updating www.sigmod.org

What gets updated, when, by whom, and how. Most updates touch one file.

## Who

- **The Information Directors** maintain the site and push changes. Anyone with
  write access to this repository can do the same.
- **Everyone else** proposes changes: use *Suggest an edit on GitHub* at the
  bottom of any page (it opens a pull request), [open an issue](https://github.com/sigmod-org/www.sigmod.org/issues/new),
  or e-mail the Information Directors.
- **Confirm before publishing.** Each item below names the role that confirms
  the content. Ask that person when the information did not come from them
  directly, for example names and affiliations copied from another site.

## What, when and who confirms

| What | When | Confirmed by | How |
|---|---|---|---|
| News item | When there is something to announce | Whoever the news is about (official announcements: the SIGMOD Chair) | [News](#news) |
| Next SIGMOD/PODS conference | When the next venue is announced | Conference Coordinator | [Conferences](#conferences) |
| Program chairs | Each conference, when the chairs are appointed | SIGMOD Chair | [Program chairs](#program-chairs) |
| Award recipients | Each spring, when the awards are announced | Chair of the Awards Committee (PODS awards: PODS Chair) | [Award recipients](#award-recipients) |
| Ongoing awards call | When the Awards Chair, the cut-off or an award changes | Chair of the Awards Committee | [Ongoing awards call](#ongoing-awards-call) |
| Officers and Executive Committee | Officers after each election (every four years, July); the committee when a member changes; PC chairs each year | SIGMOD Chair | [People](#people) |
| Executive Committee history | Same as above | SIGMOD Chair or Secretary/Treasurer | [Executive Committee history](#executive-committee-history) |
| Boards, editors, award committees | When members change | Chair of each board or committee | [People](#people) |
| PODS organization and PC | When members change | PODS Chair | [People](#people) |
| PODS Hall of Fame | Automatic, every two months, from dblp | PODS Chair | [PODS Hall of Fame](#pods-hall-of-fame) |
| Membership numbers | Once a year, from ACM's statistics | Secretary/Treasurer | One sentence in `src/content/pages/membership/index.md` |
| Menus | When a page is added or retired | Information Directors | `src/_data/nav.js` |
| Partners, volunteer note | Rarely | SIGMOD Chair or Secretary/Treasurer | `src/_data/site.js` |

Not here: the DiSC, Anthology and DBLP DVD copies are in the
[SIGMOD Archive](https://github.com/sigmod-org/archive), and copies of past
conference websites are in [mirror.sigmod.org](https://github.com/sigmod-org/mirror.sigmod.org).
Both are historical and normally need no updates.

## How changes go live

1. Edit the file on GitHub (the pencil icon, then *Commit changes*) or locally.
2. To preview: `npm install` once, then `npm run serve` and open
   http://localhost:8080.
3. Every push to `main` rebuilds and publishes the site within a minute or two
   (*Actions* tab, "Publish on GitHub Pages").

- **Batch small edits.** Several commits pushed together deploy once.
- **If a deploy fails** with "Timeout reached" in the *deploy* step, the build
  was fine and GitHub's file sync was slow: re-run the failed job (*Re-run
  failed jobs*, or `gh run rerun <id> --failed`), or push the next change.
- **Check links after larger edits:** `npm run build && node scripts/scan-site-links.mjs`
  should report "0 broken targets". The full check, with external links, is in
  [MIGRATION.md](MIGRATION.md#link-health).

### Rules for every page

- **Never change an existing `permalink`.** Old URLs must keep working. To
  retire a page, add `redirect_to: "/new/url/"` to its front matter instead of
  deleting it.
- On any page you edit by hand, add `edited: true` and set
  `updated: "YYYY-MM-DD"` (shown as "Last updated").
- Images and PDFs go in `src/static/assets/uploads/<year>/` and are linked as
  `/assets/uploads/<year>/<file>`. Leave the old `/wp-content/uploads/` files
  where they are.
- Pages are Markdown; HTML tables are fine where a page already uses them.
- Write e-mail addresses as `name AT example.org`.
- Use single, ordinary spaces: text pasted from Word or the old site often
  carries invisible no-break spaces.
- To link to a section, write its heading as HTML with an id
  (`<h2 id="benefits">Benefits</h2>`) and link to `/page/#benefits`.

## News

**Post:** award recipients (one item per year), a reminder a few weeks before
the February 1 awards cut-off, election results, a new or changed SIGMOD/PODS
venue, ACM honors for community members, tributes, and calls the community
should act on. Keep it to a few sentences and link to the page with the
details; anything that must stay current belongs on a page, not in news.

**How:** add one file, `src/content/news/<year>-<short-name>.md`:

```markdown
---
title: "2027 SIGMOD Awards"
permalink: "/2027-sigmod-awards/"
section: "sigmod"
area: "news"
date: "2027-05-15"
categories: ["Awards", "News"]
tags: ["news"]
---

The 2027 SIGMOD Awards Committee is happy to announce the recipients of this
year's awards:

- **Edgar F. Codd Innovations Award:** Name (Affiliation)

See the [SIGMOD Awards](/sigmod-awards/) page for the citations.
```

- `tags: ["news"]` lists it: the newest 8 on the home page, all on `/news/`,
  the latest 20 in `/feed.xml`.
- `date` is the announcement date and sets the order. Do not backdate.
- The `permalink` is permanent: lower case, hyphens, year plus a short name.
- `section: "pods"` for PODS news.
- To withdraw an item, add `redirect_to:` instead of deleting the file.

## Conferences

As soon as the next venue and website are announced:

1. `src/_data/conferences.json`: add the new year **at the top** (the first
   entry is "Next conference" on the home page):

   ```json
   {
     "name": "SIGMOD/PODS 2028",
     "year": 2028,
     "location": "City, Country",
     "links": [{ "label": "Conference Website", "url": "https://2028.sigmod.org/" }]
   },
   ```

2. `src/content/pages/conferences/index.md`: add the same year as the first
   table row, copying the row below.
3. Optional: a news item.

Proceedings need nothing: the Publications menu links to the ACM list.
Co-sponsored conferences (KDD, WSDM, SoCC, DEBS) are in
`src/content/pages/conferences/co-sponsored-conferences/index.md`; update it
only when a sponsorship agreement changes.

## Program chairs

Add one entry at the top of `src/_data/programChairs.json`, copying the one
below (year, conference URL, location, chairs with their home pages). It feeds
the [program chairs page](https://www.sigmod.org/sigmod-history/program-chair/)
and, from 2020, the yearly rows of the Executive Committee history. The current
PC chairs are also part of the Executive Committee on About SIGMOD (see
[People](#people)).

## Awards

### Award recipients

For each award given this year:

1. **The award's page** (`src/content/pages/sigmod-awards/<award>/index.md`):
   add a new first row to the recipients table, copying the row below (or
   "No award for <year>"). The Codd Innovations and Contributions pages use
   photos: copy the first `<figure>…</figure>` and change photo, year, name and
   citation link.
2. **Optional citation page** for the major awards (Innovations,
   Contributions, Systems, Test of Time):
   `src/content/pages/<year>-sigmod-<award>-award/index.md` with
   `permalink: "/<year>-sigmod-<award>-award/"`, `section: "sigmod"`,
   `area: "awards"`, linked from the table row.
3. **One news item** listing every award with a link to its page.

PODS awards (Best Paper, Alberto O. Mendelzon Test-of-Time) are under
`src/content/pages/pods-home/` and work the same way. A new or retired award
also needs its menu entry (`src/_data/nav.js`), a link on
`src/content/pages/sigmod-awards/index.md`, and, if it takes nominations, a row
on the ongoing awards call.

### Ongoing awards call

Nominations are open all year with an annual cut-off of **February 1**
(`src/content/pages/sigmod-awards/ongoing-awards-call/index.md`). Edit it only
when the Awards Chair or the nomination e-mail addresses change, when the
cut-off, carry-over period or nomination requirements change, or when an award
is added or retired.

## People

| What | Where |
|---|---|
| Officers (with photos) and the current Executive Committee | `src/content/pages/about-sigmod/index.md`; photos in `src/static/assets/officers/` |
| Boards, editors, Information Directors, liaisons, award committees | `src/content/pages/about-sigmod/committees/index.md` |
| SIGMOD Awards Committee (each year) | The committees page above, plus a new row on `src/content/pages/sigmod-awards/committees/sigmod-awards-committee/index.md` |
| Awards Chair | Also the e-mail addresses on the ongoing awards call |
| PODS organization and PCs | `src/content/pages/pods-home/pods-organization/index.md` |

When the Executive Committee changes, also update its history (next section).

### PODS Hall of Fame

`/pods-home/who-are-we/` is built from `src/_data/podsHallOfFame.json`. Do not
edit that file: the **Update PODS Hall of Fame** workflow
(`.github/workflows/pods-hall-of-fame.yml`) recounts it from dblp on the 1st of
every other month, commits it and publishes the site. What counts as a PODS
paper is described at the top of `scripts/pods-hall-of-fame.mjs`.

- **Recount now** (e.g. after a new PODS issue appears in dblp): Actions tab →
  Update PODS Hall of Fame → Run workflow.
- **A count is wrong:** usually a dblp author profile is split or merged
  wrongly; ask dblp to fix it, and the next recount picks it up.
- **A run failed:** dblp was down or the counts looked wrong (a year without
  papers, or far fewer papers than before). Nothing was committed; run it again
  later, or check the log.
- GitHub turns off scheduled workflows in a public repository after 60 days
  without commits. If it does, the Actions tab shows a button to turn it back on.

### Executive Committee history

`/sigmod-history/officers/` is built from `src/_data/officers.json`; the
page layout is in `src/_data/officerTerms.js` and needs no edits.

- **After an election:** add a term at the end of the last period with
  `"from"`/`"to"` (e.g. 2029/2033, July to June), the officers (`chair`,
  `viceChair`, `treasurer`), `editor`, `members` (name and role) and a source,
  with `"inProgress": true`; remove `inProgress` from the previous term.
- **Mid-term change:** give the person leaving `"to": 2027` and add the new
  person with `"from": 2027`.
- **Where people appear:** someone serving the whole term is on the term row.
  From 2013, the PODS chair, TODS EiC and PC chairs (from `programChairs.json`)
  are on a row for each year; Record editor, Information Director and
  Conference Coordinator stay on the term row with their years. Set
  `"inline": true` to put anyone else on the term row with their years.
- **Columns:** roles with "Information Director", "DiSC" or "Anthology" go to
  Information Director, "Conference Coordinator" to its own column, everything
  else to Other members (`"column": "other"` overrides).
- **Sources:** at most four per term, shown as volume(issue) links on the term
  row. The number comes from a sigmodrecord.org URL or "8(1)" in the label;
  otherwise add `"issue": "36(2)"`.
- Other switches: `"noYears"` and `"showYears"` hide or force a person's years;
  the `_readme` at the top of the file lists them all.

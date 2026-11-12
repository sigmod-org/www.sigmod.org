# SIGMOD award nominations (Apps Script app)

> **This folder is a separate application inside the www.sigmod.org repository.** The code in `apps-script/` doesn't run on GitHub Pages. It runs on Google Apps Script in the **sigmodec@gmail.com** account and is deployed by hand with `clasp` (see *Deploying changes*). The site build only takes the browser half of it: `dev/build-site.mjs` generates `src/assets/nominate.js` and `nominate.css` on every build. The live page is [sigmod.org/sigmod-awards/nominate/](https://www.sigmod.org/sigmod-awards/nominate/).


An online nomination system for the SIGMOD awards. It works like the ACM Fellows process:

1. The **nominator** fills in a form for one award on [sigmod.org/sigmod-awards/nominate/](https://www.sigmod.org/sigmod-awards/nominate/) and lists the endorsers.
2. The nominator gets an e-mail with a private link and clicks **Confirm** on that page. Nothing else happens until they do. This proves they own the address, and it stops the form being used to e-mail strangers.
3. Each **endorser** then gets an e-mail with a private link. The link shows the full nomination, takes a PDF letter, and lets them say they can't write one.
4. The nominator's link is also their **status page**. It shows which letters are in (not what they say) and lets them edit the nomination, resend, replace or add endorsers, or withdraw.
5. The **Awards Committee** works from a Drive folder. Each nomination has a folder with a `00 Summary.pdf`, the nomination files and the letters.

## How it is put together

```
www.sigmod.org (GitHub Pages, static)          sigmodec@gmail.com (Google)
┌──────────────────────────────────┐   POST    ┌───────────────────────────────┐
│ /sigmod-awards/nominate/         │ ───────▶  │ Apps Script web app (/exec)   │
│   assets/nominate.js  (the forms)│ ◀───────  │   doPost → api* functions     │
│   assets/nominate.css            │   JSON    │   Sheet: the admin dashboard  │
└──────────────────────────────────┘           │   Drive: PDFs (private)       │
                                               │   Gmail: all e-mails          │
                                               │   daily trigger: reminders    │
                                               └───────────────────────────────┘
```

- The **pages are static**. Before every Eleventy build (`eleventy.config.js`), `dev/build-site.mjs` turns `apps-script/Config.gs`, `Shared.gs`, `Client.html` and `Styles.html` into `src/assets/nominate.{js,css}`. Those two files are ignored by git and deploy with the rest of sigmod.org.
- The **only dynamic part is one Apps Script project** in the sigmodec@gmail.com account. It runs on Google's servers for free and does the storage, e-mail and reminders. The page talks to it with plain `text/plain` POSTs, which need no CORS preflight.
- Apps Script can also serve the same pages itself. Add `&direct=1` to the `/exec` URL to see them; this is handy for debugging. Without `direct`, `/exec` links redirect to sigmod.org.

## How the script is used

The Apps Script project lives in the **sigmodec@gmail.com** account. It's attached to the spreadsheet **SIGMOD Award Nominations**, which sits in the Drive folder of the same name. To open the code, open the spreadsheet and choose **Extensions → Apps Script**, or find the project at [script.google.com](https://script.google.com).

The same code runs in three ways:

| How it runs | Started by | What it does |
|---|---|---|
| **Web app** (`doPost`, `doGet`) | Every click on the sigmod.org page: submit, confirm, upload, edit, letter | The page sends `{fn, args}` to the `/exec` URL. `doPost` runs the matching `api*` function in `Code.gs` (only those listed in `API_FUNCTIONS`) and returns JSON. It runs as sigmodec, so it can write to the sheet and Drive and send mail. |
| **Spreadsheet menu** (`Admin.gs`) | You, in the sheet, under **Nominations** | One-off admin tasks: first-time setup, importing e-mail nominations, building the committee folder, regenerating summary PDFs, running the daily job by hand |
| **Daily trigger** (`dailyJob`) | Google, every morning around 7am New York time | Reminders, carry-over notices, expiring and abandoning nominations, cleaning up uploads. It's created by Setup; you can see it in the editor under **Triggers** (clock icon). |

**Where things are recorded:**
- **Data:** the sheet's tabs. `Nominations` and `Endorsements` hold one row per nomination and per endorser, and `Log` records every action.
- **Files:** Drive, under `SIGMOD Award Nominations/<Award>/<id> – <title>/`.
- **Errors:** if something fails, open the editor and look under **Executions** (list icon). Every web request, menu action and trigger run is listed there, with its error message.

**Editing data by hand** in the sheet is fine for `status`, for example to mark winners `awarded` or remove a test nomination with `withdrawn`, and for `notes`. Don't rename the column headers or edit the hidden `token`, `data` and `files` columns.

## Changing who gets the notices

Whenever a nominator confirms, edits or withdraws a nomination, an e-mail with the subject `[SIGMOD Awards nominations] …` goes to a short list of people: normally the **Awards Chair**, the **SIGMOD Secretary** and **sigmodec@gmail.com**. The list is **not in the code**, so it isn't published in this public repo and can change without a deploy. It's stored in the Apps Script project's *script properties* under the key `NOTIFY_EMAILS`.

**To change it, for example when a new Awards Chair takes over:**

1. Sign in to Google as **sigmodec@gmail.com**. If the browser has several Google accounts, check the avatar in the top right, or use a private window.
2. Open the spreadsheet **SIGMOD Award Nominations**. It's in Drive, in the folder of the same name.
3. Wait a few seconds for the **Nominations** menu to appear to the right of **Help**. If it doesn't appear, reload the page.
4. Choose **Nominations → Set notification e-mails**.
5. The box shows the current list under **Now:**. Type the **complete new list**, separated by commas; it replaces the old one rather than adding to it. For example:

   ```
   new.chair@university.edu, secretary@university.edu, sigmodec@gmail.com
   ```

6. Click **OK**. A message confirms "Saved. Notices now go to: …". If an address is mistyped, it says "Not saved" and names the bad address. Nothing changes until all addresses are valid.
7. The change applies to the very next notice. There's no code push or redeploy.

**Checking it:**
- run **Set notification e-mails** again and read the **Now:** line, then click **Cancel**
- or look at the sheet's **Log** tab, where each change appears as a `set-notify` row with the new list and who made it

**Good to know:**
- **Empty list:** if the setting is ever empty, for example on a fresh setup, notices go to `notifyFallback` in `apps-script/Config.gs` (sigmodec@gmail.com) until a list is saved.
- **Test mode:** while `testMode` is `true`, no notice reaches these people. Everything goes to `testRecipients`, and the subject shows who would have received it.
- **Changing it in the editor:** the same value can be edited in the Apps Script editor under **Project Settings → Script properties → `NOTIFY_EMAILS`**, as comma-separated addresses.
- **What this list doesn't cover:** nominators and endorsers are e-mailed at the addresses they enter in the forms. **Replies** to every e-mail go to `replyTo` in `Config.gs` (sigmodec@gmail.com); changing that one is a code change and needs a deploy.
- **Handover:** when the secretary changes, hand over the sigmodec@gmail.com account and update this list in the same session.

## Deploying changes

The live web app is a single **deployment** with a fixed ID. Each deploy creates a new numbered version under that same ID, so the `/exec` URL in `Config.gs` and in `nominate.js` never changes:

```
AKfycbzzi23SQja5ClqVSglZ51X9UYLAJfXPCAHHkSL4eneNLsKkyHiUW_sYvX-KEYujGv-9
```

**Before your first deploy** on a new machine, or as a new maintainer:

1. Clone the [www.sigmod.org](https://github.com/sigmod-org/www.sigmod.org) repo, `cd award-nominations`, and sign clasp in as **sigmodec@gmail.com**. When asked, choose *Select all*. Run every clasp command from inside `award-nominations/`.

   ```bash
   npx @google/clasp login
   ```

   Use `npx`. A global `npm install -g` often fails with a permissions error (EACCES).
2. Create `award-nominations/.clasp.json`. It isn't in git. The script ID is in the Apps Script editor under **Project Settings**.

   ```json
   { "scriptId": "<script ID>", "rootDir": "apps-script" }
   ```

**Every change:**

1. Edit the files under `apps-script/`, then check them locally with the fake backend (see *Preview without deploying*):

   ```bash
   node award-nominations/dev/build-preview.mjs && python3 -m http.server 8087 -d award-nominations/dev/out
   ```

2. Upload the code to Apps Script. `--force` answers yes to the "Manifest file has been updated" question.

   ```bash
   npx @google/clasp push --force
   ```

   This alone doesn't change the live site. The deployment still serves its previous version.
3. Make it live by publishing a new version under the same deployment:

   ```bash
   npx @google/clasp update-deployment AKfycbzzi23SQja5ClqVSglZ51X9UYLAJfXPCAHHkSL4eneNLsKkyHiUW_sYvX-KEYujGv-9 -d "what changed"
   ```

4. Commit and push **www.sigmod.org**. If you changed anything the browser uses (`Config.gs`, `Shared.gs`, `Client.html` or `Styles.html`), the GitHub Pages workflow regenerates `nominate.js` and `nominate.css` and publishes them in about a minute. There's nothing to build by hand. To see the result locally first, run `npm run serve`, which regenerates them too.
5. Keep the two halves in step: push the Apps Script deploy (steps 2–3) and the site commit together, especially when a change touches both the page and the server, such as a new form field.
6. Check it: open https://www.sigmod.org/sigmod-awards/nominate/?n=bad. It should say "This link doesn't work". That proves the page reaches the new version. Then look at **Executions** in the editor for errors.

**Undo a bad deploy** by pointing the deployment back at an earlier version:

```bash
npx @google/clasp list-versions
```

```bash
npx @google/clasp update-deployment AKfycbzzi23SQja5ClqVSglZ51X9UYLAJfXPCAHHkSL4eneNLsKkyHiUW_sYvX-KEYujGv-9 -V <version number>
```

**Trying risky changes safely:**
1. Set `testMode: true`, so every e-mail goes only to sigmodec.
2. Set `siteUrl` to your local site.
3. Deploy, test, then switch both back and deploy again.

While `testMode` is on, real nominators' e-mails are redirected too, so keep it short or do it outside the busy weeks before Feb 1.

## Authentication

| Who | How |
|---|---|
| Secretary (owner) | A normal Google sign-in as sigmodec@gmail.com. At setup you approve once, on Google's consent screen, that the script may use the account's Sheets, Drive and Gmail. The web app is deployed as *Execute as: Me*, *Access: Anyone*, so it acts with those permissions, but only as far as the code allows. |
| Awards Committee | Ordinary Drive sharing of the `Committee <year>` folder with their Google accounts. |
| Nominators, endorsers | No accounts. Each person gets a random 40-character token in a link sent only to their e-mail. Every request carries the token, and the script checks it against the sheet. The nominator must click Confirm before anything goes out. A button, rather than the link itself, does the confirming, so mail scanners that open links can't confirm by accident. |

A hidden field catches form-filling bots: if it's filled in, the submission is silently dropped. Nominations that are never confirmed are marked `abandoned` after 14 days.

## What each award asks for

Everything is in [`apps-script/Config.gs`](apps-script/Config.gs) and follows the [ongoing call](https://www.sigmod.org/sigmod-awards/ongoing-awards-call/).

| Award | Form | Letters | Active |
|---|---|---|---|
| Codd Innovations, Contributions | nominee, citation (≤25 words), description (100–250), statement PDF, CV PDF | 0–3 | 2 years |
| Distinguished Mentorship | nominee, nomination letter PDF (≤2 pages) | 3–5, at least one from someone the nominee didn't supervise | 3 years |
| Systems | system, people to recognize, citation, description, optional PDF | 0–3 | 2 years |
| Test of Time | paper (year limited to cycle −12 … −10), DOI, justification (≤750 words) | none | 2 years |

These rules are enforced on every award form, both in the browser and again on the server:
- self-nominations are refused
- the nominee and the nominator can't be endorsers
- **eligibility is confirmed by the people involved, not checked against a list.** In an "Eligibility" section above Submit, the nominator ticks that they have read the [ACM Awards Conflict of Interest Policy](https://awards.acm.org/awards-committees/conflict-of-interest) and are eligible to nominate under it. On the Codd, Contributions, Mentorship and Systems forms, they also confirm that the nominee is not a current elected officer (Chair, Vice Chair, Secretary/Treasurer) or Awards Committee member. Each endorser confirms only their own eligibility under the ACM policy before uploading a letter. Nothing needs updating when people rotate. The summary PDF records the confirmations.

**Cut-off and cycles.** A nomination confirmed by Feb 1 (end of day, AoE) is first considered that year. After that it rolls to the next year and stays active for `activeCycles` years.

**Daily job (7am).**
- reminds endorsers who haven't submitted, 14 and 3 days before the cut-off
- tells nominators about missing letters 7 days before
- e-mails carry-over nominators a "confirm or update" note on Nov 15
- expires old nominations and abandons unconfirmed ones
- clears abandoned uploads

## Setup (one time, ~30 minutes)

This was done on 2026-11-12. You only need it to rebuild everything from scratch, for example in a new Google account. For day-to-day changes, see *Deploying changes*.

You need Node. Do the Google steps while signed in as **sigmodec@gmail.com**, and run clasp through `npx`:

```bash
npx @google/clasp login
```

Turn on the Apps Script API at https://script.google.com/home/usersettings, then create the project. This makes a spreadsheet with the script bound to it. `clasp create` may overwrite the manifest, so the command keeps a copy and puts it back:

```bash
cd award-nominations && cp apps-script/appsscript.json manifest.bak && npx @google/clasp create --type sheets --title "SIGMOD Award Nominations" --rootDir apps-script && mv manifest.bak apps-script/appsscript.json
```

```bash
npx @google/clasp push --force
```

1. **Set up.** Open the spreadsheet that `clasp create` printed and reload it. Choose **Nominations → Set up (first time only)** and approve the permissions. This creates the tabs, the `SIGMOD Award Nominations` Drive folder (the sheet moves into it) and the daily trigger.
2. **Deploy.** In the Apps Script editor (Extensions → Apps Script), go to **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has access: Anyone*. Copy the `/exec` URL.
3. **Configure** `apps-script/Config.gs`: set `apiUrl` to the `/exec` URL and leave `testMode: true` for now. Then set the notice recipients from the sheet (see *Changing who gets the notices*).
4. **Push and publish.** Push the code and deploy a new version from **Deploy → Manage deployments → Edit → New version**. This keeps the same URL.
5. **Publish the page**: commit and push www.sigmod.org. The build generates the form code. Until `apiUrl` is set, the page says "Online nominations open soon".

**Dry run.** With `testMode: true`, every e-mail, including the admin notices, goes only to `testRecipients` (sigmodec@gmail.com), with the real recipient in the subject.

- To test before the site is deployed, set `siteUrl` to `http://localhost:8080/sigmod-awards/nominate/` and run the site locally (`npm run serve` in www.sigmod.org). The links in the test e-mails will then open your local copy.
- Make a nomination for each award, confirm it from the e-mail, open the endorser links, and submit letters.

**Go live.**
1. Set `siteUrl` back to `https://www.sigmod.org/sigmod-awards/nominate/` and `testMode: false`.
2. Push and deploy a new version.
3. Link the page from "How to submit" on the [call page](https://www.sigmod.org/sigmod-awards/ongoing-awards-call/).

After going live, follow *Deploying changes* for every update.

## Each cycle

- **Before Feb 1:** nothing to do. Watch the `Nominations` tab: its `letters` column shows, for example, `2/3`.
- **After Feb 1:** **Nominations → Build committee folder for this cycle** creates `Committee <year>/<Award>/` with shortcuts to every active nomination and an `Index <year>` sheet. Share that folder, view only, with the committee.
- **After the awards:** set the winners' `status` to `awarded` so they stop carrying over.

## Importing nominations received by e-mail

1. Put each one's PDFs in a Drive folder.
2. Fill one row per nomination in the **Import** tab: `award` key, `firstCycle`, title, nominator, citation and description if any, the folder link, and `endorsers` as `Name <email>; Name <email>` for letters already received.
3. **Nominations → Import e-mail nominations.** Files are copied, letters are recorded as received, and nobody is e-mailed. Imported nominations count as confirmed.
4. When you're ready, use **E-mail imported nominators their links**. Saving an edit from their page requires the award's required fields, including the PDFs.

## Limits

- **E-mail quota:** a consumer Gmail account sends to about **100 recipients a day**. Watch it in the last days before Feb 1. If it becomes a problem, move the project to a Google Workspace account (1,500 a day).
- **Uploads:** PDFs up to 10 MB each, checked for a real PDF header.
- **Replaced files:** a replaced statement or letter goes to Drive trash, where it can be recovered for 30 days.
- **Log:** the `Log` tab records every action.

## Preview without deploying

```bash
node award-nominations/dev/build-preview.mjs && python3 -m http.server 8087 -d award-nominations/dev/out
```

This builds every page with a fake backend:
- `site/index.html` is the sigmod.org version. Try `?award=codd`, `?n=unconfirmed`, `?n=active`, `?e=x` and `?n=bad`.
- `apps-script/` holds the pages as Apps Script serves them.

## Files

| File | What |
|---|---|
| `apps-script/Config.gs` | awards, fields, rules, dates, URLs, reply-to and test settings (notice recipients are in script properties) |
| `apps-script/Shared.gs` | validation and date logic, used by the server and the browser |
| `apps-script/Code.gs` | `doPost` JSON API, `doGet`, and the `api*` functions |
| `apps-script/Store.gs` | sheet and Drive helpers |
| `apps-script/Mail.gs` | e-mail texts and the summary PDF |
| `apps-script/Admin.gs` | menu, setup, daily job, committee export, import |
| `apps-script/Client.html`, `Styles.html` | the forms, used both on sigmod.org and by Apps Script |
| `apps-script/App.html` | page frame when Apps Script serves the forms itself |
| `dev/build-site.mjs` | generates `src/assets/nominate.{js,css}` for the site; run by `eleventy.config.js` before every build |
| `dev/build-preview.mjs` | local previews with a fake backend |

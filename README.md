# sigmod.org

Static site for ACM SIGMOD and ACM PODS, migrated from WordPress with all URLs preserved.

```bash
npm install
npm run serve     # http://localhost:8080
npm run build     # static site in _site/
```

**Updating the site** (news, conferences, awards): see [docs/UPDATING.md](docs/UPDATING.md).

## Award nominations: a separate Apps Script app

The online nomination form at [/sigmod-awards/nominate/](https://www.sigmod.org/sigmod-awards/nominate/) is **not just a page**. Its logic lives in **[`award-nominations/`](award-nominations/README.md)**, an application that runs on Google Apps Script in the sigmodec@gmail.com account. It stores nominations, sends the e-mails and runs the reminders.

- **Server code:** `award-nominations/apps-script/`. It's deployed to Google by hand with `clasp`, **not** by pushing this repo. See [its README](award-nominations/README.md#deploying-changes).
- **Browser code:** `src/assets/nominate.js` and `nominate.css` are **generated** from `apps-script/` before every build (`eleventy.config.js`) and ignored by git. Don't create or edit them by hand.
- **Changing award rules:** the cut-off, what to submit, word limits and letters are stated both on the [ongoing call](src/content/pages/sigmod-awards/ongoing-awards-call/index.md) and in `award-nominations/apps-script/Config.gs`. Change both together (see [docs/UPDATING.md](docs/UPDATING.md#ongoing-awards-call)).
- **Who gets the notice e-mails** (Awards Chair, Secretary) is set in the nominations spreadsheet, not in code: see [Changing who gets the notices](award-nominations/README.md#changing-who-gets-the-notices).

See [docs/MIGRATION.md](docs/MIGRATION.md) for the content audit, proposed structure and hosting plan, and [docs/CLEANUP.md](docs/CLEANUP.md) for the running list of pages to merge or retire.

## To do

- [ ] **A competition for a new SIGMOD logo.** The site still uses the 1998 logo; candidate designs so far are in [sigmod-org/sigmod-logo](https://github.com/sigmod-org/sigmod-logo).
- [ ] **Rethink the SIGMOD mission statement.** Today it is told as history on [SIGMOD's Mission](https://www.sigmod.org/sigmod-history/sigmods-mission/) (`src/content/pages/sigmod-history/sigmods-mission/index.md`); a current statement could also open the [About SIGMOD](https://www.sigmod.org/about-sigmod/) page.

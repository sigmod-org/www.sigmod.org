/**
 * Admin: setup, the daily job, committee export, and importing nominations
 * that arrived by e-mail. Run these from the spreadsheet's "Nominations" menu
 * (or from the Apps Script editor).
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Nominations')
    .addItem('Set up (first time only)', 'setup')
    .addSeparator()
    .addItem('Import e-mail nominations from the Import tab', 'importLegacy')
    .addItem('E-mail imported nominators their links', 'sendLegacyWelcome')
    .addSeparator()
    .addItem('Build committee folder for this cycle', 'exportCurrentCycle')
    .addItem('Regenerate all summary PDFs', 'regenerateSummaries')
    .addItem('Run the daily job now', 'dailyJob')
    .addSeparator()
    .addItem('Set notification e-mails', 'setNotifyEmails')
    .addToUi();
}

/**
 * Who receives the admin notices (new, updated and withdrawn nominations).
 * Kept in the script properties so the addresses are not in the public repo
 * and can change without a code deploy.
 */
function setNotifyEmails() {
  var ui = SpreadsheetApp.getUi();
  var current = notifyEmails().join(', ');
  var r = ui.prompt('Notification e-mails',
    'Addresses that get a copy of every new, updated and withdrawn nomination, separated by commas ' +
    '(for example the Awards Chair, the Secretary and sigmodec@gmail.com).\n\nNow: ' + current,
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var list = r.getResponseText().split(/[\s,;]+/).filter(String);
  var bad = list.filter(function (e) { return !isEmail(e); });
  if (!list.length || bad.length) { ui.alert('Not saved: ' + (bad.join(', ') || 'no addresses given') + '.'); return; }
  props().setProperty('NOTIFY_EMAILS', list.join(','));
  log('set-notify', '', Session.getEffectiveUser().getEmail(), list.join(', '));
  ui.alert('Saved. Notices now go to: ' + list.join(', '));
}

/** Creates the sheets, the Drive folders and the daily trigger. Safe to re-run. */
function setup() {
  var p = props();
  var book;
  try { book = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { book = null; }
  if (!book && p.getProperty('SPREADSHEET_ID')) book = SpreadsheetApp.openById(p.getProperty('SPREADSHEET_ID'));
  if (!book) book = SpreadsheetApp.create('SIGMOD Award Nominations');
  p.setProperty('SPREADSHEET_ID', book.getId());

  Object.keys(SHEETS).forEach(function (name) {
    var sh = book.getSheetByName(name) || book.insertSheet(name);
    var head = SHEETS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e9effa');
    sh.setFrozenRows(1);
  });
  var first = book.getSheetByName('Sheet1');
  if (first && book.getSheets().length > 1) book.deleteSheet(first);

  var nomSheet = book.getSheetByName('Nominations');
  var statusCol = SHEETS.Nominations.indexOf('status') + 1;
  nomSheet.getRange(2, statusCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(NOMINATION_STATUSES, true).build());
  ['data', 'files', 'token'].forEach(function (k) { nomSheet.hideColumns(SHEETS.Nominations.indexOf(k) + 1); });
  book.getSheetByName('Endorsements').hideColumns(SHEETS.Endorsements.indexOf('token') + 1);
  book.getSheetByName('Import').getRange(1, 1).setNote(
    'One row per nomination received by e-mail. award: ' + AWARD_ORDER.join(' | ') +
    '. firstCycle: award year it was first considered for. filesFolderUrl: a Drive folder with its PDFs. ' +
    'endorsers: "Name <email>; Name <email>" for letters already received. Then use Nominations → Import.');

  if (!p.getProperty('ROOT_FOLDER_ID')) {
    var root = DriveApp.createFolder('SIGMOD Award Nominations');
    p.setProperty('ROOT_FOLDER_ID', root.getId());
    p.setProperty('STAGING_FOLDER_ID', root.createFolder('_staging').getId());
    DriveApp.getFileById(book.getId()).moveTo(root);
  }
  AWARD_ORDER.forEach(awardFolder);

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(7).create();
  log('setup', '', Session.getEffectiveUser().getEmail(), '');
}

/** Reminders, carry-over notices, expiry, staging clean-up. Runs every morning. */
function dailyJob() {
  var now = new Date();
  var cycle = cycleFor(now);
  var daysLeft = Math.ceil((deadlineFor(cycle).getTime() - now.getTime()) / 86400000);
  var noms = readAll('Nominations');

  // 1. Expire nominations past their last cycle.
  noms.forEach(function (n) {
    if (n.status === 'active' && Number(n.lastCycle) < cycle) {
      n.status = 'expired';
      save('Nominations', n, ['status']);
      log('expire', n.id, 'system', '');
    }
  });
  // Nominations never confirmed by the nominator are dropped after 14 days.
  noms.forEach(function (n) {
    if (n.status === 'unconfirmed' && now - n.created > 14 * 86400000) {
      n.status = 'abandoned';
      save('Nominations', n, ['status']);
      log('abandon', n.id, 'system', '');
    }
  });
  var active = noms.filter(function (n) { return n.status === 'active'; });

  // 2. Endorser reminders, and a heads-up to nominators with missing letters.
  var ends = readAll('Endorsements');
  active.forEach(function (n) {
    var pending = ends.filter(function (e) {
      return e.nominationId === n.id && e.status === 'invited' && now - e.invitedAt > 2 * 86400000;
    });
    if (CONFIG.reminderDaysBefore.indexOf(daysLeft) >= 0) {
      pending.forEach(function (e) {
        if (e.lastReminder instanceof Date && now - e.lastReminder < 86400000) return;
        mailEndorserReminder(n, e, daysLeft);
        e.lastReminder = now;
        save('Endorsements', e, ['lastReminder']);
      });
    }
    if (daysLeft === CONFIG.nominatorReminderDays && pending.length) mailNominatorMissing(n, pending);
  });

  // 3. Carry-over notices, once per cycle, from the configured date.
  var c = CONFIG.carryOverNotice;
  var noticeDate = new Date(Date.UTC(cycle - 1, c.month - 1, c.day));
  if (now >= noticeDate) {
    active.forEach(function (n) {
      if (Number(n.firstCycle) < cycle && Number(n.carryNoticeCycle) !== cycle) {
        mailCarryOver(n, cycle);
        n.carryNoticeCycle = cycle;
        save('Nominations', n, ['carryNoticeCycle']);
      }
    });
  }

  // 4. Delete uploads that were never attached to a submitted form.
  var it = stagingFolder().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (now - f.getDateCreated() > 86400000) f.setTrashed(true);
  }
}

/**
 * Builds "Committee <cycle>" in the root folder: one subfolder per award with
 * shortcuts to every nomination active this cycle, plus an index sheet.
 * Share that folder (view only) with the Awards Committee.
 */
function exportCurrentCycle() { exportCycle(cycleFor(new Date())); }

function exportCycle(cycle) {
  var root = rootFolder();
  var name = 'Committee ' + cycle;
  var it = root.getFoldersByName(name);
  var out = it.hasNext() ? it.next() : root.createFolder(name);
  var ends = readAll('Endorsements');
  var rows = [['Award', 'Nomination', 'Title', 'Nominator', 'First cycle', 'Letters in', 'Letters requested', 'Folder']];
  readAll('Nominations').filter(function (n) {
    return n.status === 'active' && Number(n.firstCycle) <= cycle && Number(n.lastCycle) >= cycle;
  }).forEach(function (n) {
    var sub = out.getFoldersByName(AWARDS[n.award].short);
    var folder = sub.hasNext() ? sub.next() : out.createFolder(AWARDS[n.award].short);
    var target = nominationFolder(n);
    if (!folder.getFilesByName(target.getName()).hasNext()) {
      DriveApp.getFileById(DriveApp.createShortcut(target.getId()).getId()).moveTo(folder);
    }
    var es = ends.filter(function (e) { return e.nominationId === n.id && e.status !== 'removed' && e.status !== 'declined'; });
    rows.push([AWARDS[n.award].short, n.id, n.title, n.nominatorName, n.firstCycle,
      es.filter(function (e) { return e.status === 'submitted'; }).length, es.length, n.folderUrl]);
    buildSummary(n);
  });
  var idx = out.getFilesByName('Index ' + cycle);
  var book = idx.hasNext() ? SpreadsheetApp.open(idx.next()) : SpreadsheetApp.create('Index ' + cycle);
  if (!idx.hasNext()) DriveApp.getFileById(book.getId()).moveTo(out);
  var sh = book.getSheets()[0];
  sh.clear();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
  log('export', '', Session.getEffectiveUser().getEmail(), { cycle: cycle, nominations: rows.length - 1 });
  return out.getUrl();
}

function regenerateSummaries() {
  readAll('Nominations').forEach(function (n) { if (n.status === 'active') buildSummary(n); });
}

/**
 * Import the rows of the Import tab that have no importedId yet. Files in
 * filesFolderUrl are copied (originals stay where they are). Endorsers listed
 * are recorded as letters already received. Nobody is e-mailed.
 */
function importLegacy() {
  var rows = readAll('Import');
  var done = 0;
  rows.forEach(function (r) {
    if (r.importedId) return;
    var award = AWARDS[String(r.award).trim()];
    if (!award) throw new Error('Import row ' + r._row + ': unknown award "' + r.award + '".');
    var first = Number(r.firstCycle);
    if (!first) throw new Error('Import row ' + r._row + ': firstCycle is required.');
    withLock(function () {
      var id = newNominationId(first);
      var folder = awardFolder(String(r.award).trim()).createFolder(id + ' – ' + safeName(r.title));
      var data = {};
      data[award.titleKey] = String(r.title);
      if (award.nomineeEmailKey) data[award.nomineeEmailKey] = String(r.nomineeEmail || '');
      if (r.citation) data.citation = String(r.citation);
      if (r.description) data.description = String(r.description);
      var copied = [];
      var m = String(r.filesFolderUrl || '').match(/folders\/([\w-]+)/);
      if (m) {
        var fit = DriveApp.getFolderById(m[1]).getFiles();
        while (fit.hasNext()) { var f = fit.next(); f.makeCopy(f.getName(), folder); copied.push(f.getName()); }
      }
      var nom = append('Nominations', {
        id: id, award: String(r.award).trim(), firstCycle: first, lastCycle: first + award.activeCycles - 1,
        status: first + award.activeCycles - 1 >= cycleFor(new Date()) ? 'active' : 'expired',
        title: r.title, nomineeEmail: r.nomineeEmail || '', nominatorName: r.nominatorName,
        nominatorEmail: r.nominatorEmail, nominatorAffiliation: r.nominatorAffiliation, source: 'email',
        created: new Date(), updated: new Date(), folderUrl: folder.getUrl(), token: newToken(),
        data: JSON.stringify(data), files: '{}', notes: copied.length ? 'Imported files: ' + copied.join(', ') : ''
      });
      String(r.endorsers || '').split(/;/).map(function (s) { return s.trim(); }).filter(String).forEach(function (s, i) {
        var mm = s.match(/^(.*?)\s*<([^>]+)>$/);
        append('Endorsements', { id: id + '-L' + (i + 1), nominationId: id, name: mm ? mm[1] : s, email: mm ? mm[2] : '',
          affiliation: '', relationship: '', nonSupervisee: '', status: 'submitted', invitedAt: '',
          submittedAt: '', fileId: '', declineReason: 'Received by e-mail', token: newToken() });
      });
      refreshLetterCount(nom);
      r.importedId = id;
      save('Import', r, ['importedId']);
      log('import', id, Session.getEffectiveUser().getEmail(), { row: r._row });
      buildSummary(nom);
      done++;
    });
  });
  try { SpreadsheetApp.getUi().alert('Imported ' + done + ' nomination(s).'); } catch (e) { /* run from editor */ }
}

/** E-mail each active imported nominator their private link (once). */
function sendLegacyWelcome() {
  var sent = 0;
  readAll('Nominations').forEach(function (n) {
    if (n.source !== 'email' || n.status !== 'active' || /welcome sent/.test(n.notes)) return;
    mailLegacyWelcome(n);
    n.notes = (n.notes ? n.notes + ' · ' : '') + 'welcome sent ' + Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
    save('Nominations', n, ['notes']);
    sent++;
  });
  try { SpreadsheetApp.getUi().alert('Sent ' + sent + ' e-mail(s).'); } catch (e) { /* run from editor */ }
}

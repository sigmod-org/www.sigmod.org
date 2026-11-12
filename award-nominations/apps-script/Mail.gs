/**
 * E-mails and the per-nomination summary PDF.
 * A consumer Gmail account can send to about 100 recipients a day; the
 * daily job spreads reminders out, but keep an eye on it near the cut-off.
 */

function send(to, subject, html) {
  var real = to;
  if (CONFIG.testMode) {
    to = CONFIG.testRecipients.join(',');
    subject = '[TEST → ' + real + '] ' + subject;
  }
  MailApp.sendEmail({
    to: to, subject: subject, htmlBody: wrapMail(html), body: htmlToText(html),
    name: CONFIG.senderName, replyTo: CONFIG.replyTo
  });
}

/** Notice recipients, from the script properties (Nominations → Set notification e-mails). */
function notifyEmails() {
  var v = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAILS');
  var list = String(v || '').split(/[\s,;]+/).filter(isEmail);
  return list.length ? list : CONFIG.notifyFallback;
}

function mailAdmins(subject, html) {
  var real = notifyEmails();
  var to = CONFIG.testMode ? CONFIG.testRecipients : real;
  if (!to.length) return;
  if (CONFIG.testMode) subject = '[TEST → ' + real.join(', ') + '] ' + subject;
  MailApp.sendEmail({ to: to.join(','), subject: '[SIGMOD Awards nominations] ' + subject,
    htmlBody: wrapMail(html), body: htmlToText(html), name: CONFIG.senderName });
}

function wrapMail(inner) {
  return '<div style="font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937;max-width:620px">' +
    inner + '<p style="color:#6b7280;font-size:13px;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:12px">' +
    esc(CONFIG.senderName) + ' · <a href="' + CONFIG.callUrl + '">Call for nominations</a> · Questions: reply to this e-mail.</p></div>';
}

function htmlToText(html) {
  return html.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2 ($1)').replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|li|h\d|tr)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDeadline(cycle) {
  var d = CONFIG.deadline;
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];
  return months[d.month - 1] + ' ' + d.day + ', ' + cycle + ' (Anywhere on Earth)';
}

function button(url, label) {
  return '<p><a href="' + url + '" style="display:inline-block;background:#1f4fa3;color:#fff;padding:10px 18px;' +
    'border-radius:6px;text-decoration:none;font-weight:600">' + esc(label) + '</a></p>';
}

function mailConfirmNomination(nom) {
  var award = AWARDS[nom.award];
  var n = activeEndorsements(nom.id).length;
  send(nom.nominatorEmail, 'Please confirm your nomination of ' + nom.title,
    '<p>Dear ' + esc(nom.nominatorName) + ',</p>' +
    '<p>We received your nomination of <b>' + esc(nom.title) + '</b> for the ' + esc(award.name) + '. ' +
    'To make sure it came from you, please open the link below and click <b>Confirm</b>.' +
    (n ? ' Your ' + (n === 1 ? 'endorser' : n + ' endorsers') + ' will be invited only after you confirm.' : '') + '</p>' +
    button(statusUrl(nom), 'Open and confirm your nomination') +
    '<p>This link is also your private page for the nomination: keep it to check status or make changes later. ' +
    'If you did not submit this nomination, ignore this e-mail and nothing will happen.</p>');
}

function mailNominationReceived(nom) {
  var award = AWARDS[nom.award];
  var es = activeEndorsements(nom.id);
  send(nom.nominatorEmail, 'Nomination confirmed: ' + nom.title + ' for the ' + award.short,
    '<p>Dear ' + esc(nom.nominatorName) + ',</p>' +
    '<p>Thank you for confirming your nomination of <b>' + esc(nom.title) + '</b> for the ' + esc(award.name) + '. Nomination ' +
    nom.id + ' will be considered for the ' + nom.firstCycle + ' award' +
    (nom.lastCycle > nom.firstCycle ? ' and stays active through ' + nom.lastCycle : '') + '.</p>' +
    (es.length ? '<p>We have invited ' + es.length + ' endorser' + (es.length > 1 ? 's' : '') + ' (' +
      esc(es.map(function (e) { return e.name; }).join(', ')) + ') to submit their letters by ' + fmtDeadline(nom.firstCycle) +
      '. You can follow their progress, but not read their letters, on your nomination page.</p>' : '') +
    '<p>Use this private link to check status, update the nomination, or change endorsers. Keep it; anyone with the link can edit the nomination.</p>' +
    button(statusUrl(nom), 'Open your nomination'));
}

function mailEndorserInvite(nom, e, isResend) {
  var award = AWARDS[nom.award];
  var cycle = cycleFor(new Date());
  send(e.email, (isResend ? 'Reminder: ' : '') + 'Supporting letter request: ' + nom.title + ', ' + award.short,
    '<p>Dear ' + esc(e.name) + ',</p>' +
    '<p>' + esc(nom.nominatorName) + ' (' + esc(nom.nominatorAffiliation) + ') has nominated <b>' + esc(nom.title) +
    '</b> for the <a href="' + award.url + '">' + esc(award.name) + '</a> and named you as someone who could write a supporting letter.</p>' +
    '<p>The link below shows you the full nomination. You can upload your letter (PDF) there, or let us know that you cannot write one. ' +
    'Letters are seen only by the SIGMOD Awards Committee, not by the nominator.</p>' +
    '<p><b>Please submit by ' + fmtDeadline(cycle) + '.</b> Supporting letters should convey additional facts about the nominee rather than simply endorse the nomination.</p>' +
    button(endorseUrl(e), 'View nomination and submit letter'));
}

function mailEndorserReminder(nom, e, daysLeft) {
  var award = AWARDS[nom.award];
  send(e.email, 'Reminder: supporting letter for ' + nom.title + ' due in ' + daysLeft + ' day' + (daysLeft > 1 ? 's' : ''),
    '<p>Dear ' + esc(e.name) + ',</p><p>This is a reminder that ' + esc(nom.nominatorName) +
    ' asked you for a supporting letter for the nomination of <b>' + esc(nom.title) + '</b> for the ' + esc(award.name) +
    '. The cut-off is ' + fmtDeadline(cycleFor(new Date())) + '.</p>' +
    '<p>If you are unable to write a letter, please say so on the page below so the nominator can ask someone else.</p>' +
    button(endorseUrl(e), 'View nomination and submit letter'));
}

function mailEndorserThanks(nom, e) {
  send(e.email, 'Letter received: ' + nom.title,
    '<p>Dear ' + esc(e.name) + ',</p><p>Thank you. We received your supporting letter for the nomination of <b>' +
    esc(nom.title) + '</b> for the ' + esc(AWARDS[nom.award].name) + '. You can replace it until the cut-off using the same link.</p>' +
    button(endorseUrl(e), 'Open the nomination'));
}

function mailEndorserReleased(nom, e) {
  send(e.email, 'Letter no longer needed: ' + nom.title,
    '<p>Dear ' + esc(e.name) + ',</p><p>The nominator no longer needs your supporting letter for the nomination of <b>' +
    esc(nom.title) + '</b> for the ' + esc(AWARDS[nom.award].name) + '. No action is needed. Thank you for your time.</p>');
}

function mailNominatorEndorserUpdate(nom, e) {
  var declined = e.status === 'declined';
  send(nom.nominatorEmail, (declined ? 'Endorser unable to write: ' : 'Letter received from ') + e.name + ' (' + nom.title + ')',
    '<p>Dear ' + esc(nom.nominatorName) + ',</p>' +
    (declined
      ? '<p>' + esc(e.name) + ' is unable to write a supporting letter for your nomination of <b>' + esc(nom.title) + '</b>' +
        (e.declineReason ? ' and wrote: “' + esc(e.declineReason) + '”' : '') + '. You can invite someone else from your nomination page.</p>'
      : '<p>' + esc(e.name) + ' has submitted a supporting letter for your nomination of <b>' + esc(nom.title) + '</b>.</p>') +
    button(statusUrl(nom), 'Open your nomination'));
}

function mailNominatorMissing(nom, pending) {
  send(nom.nominatorEmail, 'Letters still missing for ' + nom.title,
    '<p>Dear ' + esc(nom.nominatorName) + ',</p><p>The cut-off for your nomination of <b>' + esc(nom.title) + '</b> is ' +
    fmtDeadline(cycleFor(new Date())) + '. These endorsers have not submitted yet: ' +
    esc(pending.map(function (e) { return e.name; }).join(', ')) + '. They have been reminded; you may want to check in with them or invite someone else.</p>' +
    button(statusUrl(nom), 'Open your nomination'));
}

function mailCarryOver(nom, cycle) {
  var award = AWARDS[nom.award];
  send(nom.nominatorEmail, 'Your nomination of ' + nom.title + ' carries over to ' + cycle,
    '<p>Dear ' + esc(nom.nominatorName) + ',</p><p>Your nomination of <b>' + esc(nom.title) + '</b> for the ' + esc(award.name) +
    ' remains active and will be considered again for the ' + cycle + ' award' +
    (nom.lastCycle > cycle ? ' (and through ' + nom.lastCycle + ')' : ' (its last year)') +
    '. No action is needed, but you are welcome to update it, for example with a revised statement or new supporting letters, before ' +
    fmtDeadline(cycle) + '. If you would rather withdraw it, you can do that from the same page.</p>' +
    button(statusUrl(nom), 'Review your nomination'));
}

function mailLegacyWelcome(nom) {
  var award = AWARDS[nom.award];
  send(nom.nominatorEmail, 'Your nomination of ' + nom.title + ' is now online',
    '<p>Dear ' + esc(nom.nominatorName) + ',</p><p>SIGMOD now collects award nominations online. Your nomination of <b>' +
    esc(nom.title) + '</b> for the ' + esc(award.name) + ', sent earlier by e-mail, has been added and remains active through ' +
    nom.lastCycle + '. The letters you sent are on file.</p>' +
    '<p>From the page below you can check what we have, update the nomination, or invite additional endorsers, who will receive their own link.</p>' +
    button(statusUrl(nom), 'Open your nomination'));
}

function adminSummaryHtml(nom) {
  var es = activeEndorsements(nom.id);
  return '<p><b>' + esc(nom.title) + '</b> — ' + esc(AWARDS[nom.award].name) + '<br>Nominated by ' + esc(nom.nominatorName) +
    ' (' + esc(nom.nominatorAffiliation) + ', ' + esc(nom.nominatorEmail) + ')<br>Active ' + nom.firstCycle + '–' + nom.lastCycle +
    ' · Status: ' + esc(nom.status) + '</p>' +
    (es.length ? '<p>Endorsers: ' + es.map(function (e) { return esc(e.name) + ' (' + e.status + ')'; }).join(', ') + '</p>' : '') +
    '<p><a href="' + nom.folderUrl + '">Drive folder</a></p>';
}

/** (Re)write "00 Summary.pdf" in the nomination folder for the committee. */
function buildSummary(nom) {
  nom = findOne('Nominations', 'id', nom.id);
  var award = AWARDS[nom.award];
  var data = nominationData(nom);
  var files = nominationFiles(nom);
  var es = activeEndorsements(nom.id);
  var deadline = deadlineFor(cycleFor(new Date()));
  var rows = award.fields.map(function (f) {
    var v = f.type === 'file' ? (files[f.key] ? 'Attached: ' + f.label + '.pdf' : '—') : (data[f.key] || '—');
    return '<tr><th>' + esc(f.label) + '</th><td>' + esc(v).replace(/\n/g, '<br>') + '</td></tr>';
  }).join('');
  var letters = es.map(function (e) {
    var late = e.submittedAt instanceof Date && e.submittedAt > deadlineFor(nom.firstCycle) ? ' (after ' + nom.firstCycle + ' cut-off)' : '';
    return '<tr><td>' + esc(e.name) + '<br><small>' + esc(e.affiliation) + '</small></td><td>' + esc(e.relationship) +
      (award.endorsers.requireNonSupervisee ? '<br><small>' + (e.nonSupervisee === true ? 'Not supervised by nominee' : 'Supervised by nominee') + '</small>' : '') +
      '</td><td>' + esc(e.status) + late + '</td></tr>';
  }).join('');
  var html = '<html><head><style>body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;color:#111}' +
    'h1{font-size:16pt;margin:0 0 4px}h2{font-size:12pt;margin:18px 0 6px}table{border-collapse:collapse;width:100%}' +
    'th,td{border:1px solid #ccc;padding:5px 7px;vertical-align:top;text-align:left}th{width:28%;background:#f3f6fb}' +
    '.m{color:#555}</style></head><body>' +
    '<h1>' + esc(nom.title) + '</h1><div class="m">' + esc(award.name) + ' · Nomination ' + nom.id + ' · Active ' +
    nom.firstCycle + '–' + nom.lastCycle + ' · ' + esc(nom.status) + '</div>' +
    '<h2>Nominator</h2><table><tr><th>Name</th><td>' + esc(nom.nominatorName) + '</td></tr><tr><th>Affiliation</th><td>' +
    esc(nom.nominatorAffiliation) + '</td></tr><tr><th>E-mail</th><td>' + esc(nom.nominatorEmail) + '</td></tr></table>' +
    '<h2>Nomination</h2><table>' + rows + '</table>' +
    (award.endorsers.max ? '<h2>Supporting letters</h2>' + (letters ? '<table><tr><th>Endorser</th><th>Relationship</th><th>Status</th></tr>' +
      letters + '</table>' : '<p>None requested.</p>') : '') +
    (nom.source !== 'email' ? '<p class="m">The nominator confirmed being eligible to nominate under the ACM Awards Conflict of Interest Policy' +
      (award.checkEligibility ? ' and that the nominee is not a current SIGMOD officer or Awards Committee member' : '') +
      (award.endorsers.max ? '. Each endorser confirmed being eligible to endorse under the same policy when submitting a letter' : '') + '.</p>' : '') +
    '<p class="m" style="margin-top:18px">Generated ' + Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd HH:mm') + ' UTC' +
    (nom.source === 'email' ? ' · Imported from an e-mail nomination' : '') + '</p></body></html>';
  var folder = nominationFolder(nom);
  var old = folder.getFilesByName('00 Summary.pdf');
  while (old.hasNext()) old.next().setTrashed(true);
  folder.createFile(Utilities.newBlob(html, 'text/html', 'summary.html').getAs('application/pdf').setName('00 Summary.pdf'));
}

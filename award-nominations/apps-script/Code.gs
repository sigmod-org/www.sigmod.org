/**
 * SIGMOD award nominations: web app entry points and API.
 *
 * URLs (all on the deployed web app):
 *   ?               list of awards
 *   ?award=<key>    nomination form for one award
 *   ?n=<token>      the nominator's page: status, edits, endorsers
 *   ?e=<token>      an endorser's page: read the nomination, upload a letter
 */

// ---------------------------------------------------------------- pages

/** What a page needs to render, from its URL parameters. Used by doGet and the JSON API. */
function apiBoot(p) {
  p = p || {};
  var boot = { cycle: cycleFor(new Date()), deadline: deadlineFor(cycleFor(new Date())).toISOString(), view: 'home' };
  try {
    if (p.award) {
      if (!AWARDS[p.award]) throw new Error('Unknown award.');
      boot.view = 'nominate';
      boot.award = p.award;
    } else if (p.n) {
      boot.view = 'status';
      boot.nomination = nominatorView(p.n);
      boot.token = p.n;
    } else if (p.e) {
      boot.view = 'endorse';
      boot.endorsement = endorserView(p.e);
      boot.token = p.e;
    }
  } catch (err) {
    boot.view = 'error';
    boot.message = err.message;
  }
  return boot;
}

/**
 * JSON API for the page hosted on sigmod.org. The browser POSTs
 * {fn, args} as text/plain (a "simple" request, so no CORS preflight) and
 * gets {result} or {error} back.
 */
var API_FUNCTIONS = ['apiBoot', 'apiUpload', 'apiSubmitNomination', 'apiConfirm', 'apiUpdateNomination',
  'apiAddEndorser', 'apiRemoveEndorser', 'apiResendInvite', 'apiWithdraw', 'apiGetFile',
  'apiSubmitEndorsement', 'apiDeclineEndorsement'];

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    if (API_FUNCTIONS.indexOf(req.fn) < 0) throw new Error('Unknown request.');
    out = { result: globalThis[req.fn].apply(null, req.args || []) };
  } catch (err) {
    out = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (CONFIG.siteUrl && !p.direct) {
    // The public pages live on sigmod.org; send old or direct links there.
    var q = Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
    return HtmlService.createHtmlOutput('<script>window.top.location.replace(' +
      JSON.stringify(CONFIG.siteUrl + (q ? '?' + q : '')) + ');</script>');
  }
  var boot = apiBoot(p);
  boot.baseUrl = ScriptApp.getService().getUrl();
  var t = HtmlService.createTemplateFromFile('App');
  t.bootstrap = JSON.stringify(boot).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('SIGMOD Award Nominations')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/** Config and shared helpers, as source for the page. */
function sharedSource() {
  var fns = [countWords, normEmail, isEmail, normName, deadlineFor, cycleFor, fieldOptions,
    validateFields, validateEndorsers, hasErrors];
  return 'var CONFIG = ' + JSON.stringify(publicConfig()) + ';\n' +
    'var AWARDS = ' + JSON.stringify(AWARDS) + ';\n' +
    'var AWARD_ORDER = ' + JSON.stringify(AWARD_ORDER) + ';\n' +
    fns.map(function (f) { return f.toString(); }).join('\n');
}

function publicConfig() {
  return { org: CONFIG.org, deadline: CONFIG.deadline, maxUploadMB: CONFIG.maxUploadMB,
    callUrl: CONFIG.callUrl, awardsUrl: CONFIG.awardsUrl, replyTo: CONFIG.replyTo,
    eligibilityRule: CONFIG.eligibilityRule, officersUrl: CONFIG.officersUrl, committeeUrl: CONFIG.committeeUrl,
    coiUrl: CONFIG.coiUrl };
}

function nominatorView(token) {
  var nom = findOne('Nominations', 'token', token);
  if (!token || !nom) throw new Error('This link is not valid. Check the most recent e-mail from ' + CONFIG.senderName + '.');
  return {
    id: nom.id, award: nom.award, status: nom.status, title: nom.title,
    firstCycle: nom.firstCycle, lastCycle: nom.lastCycle, source: nom.source,
    nominator: { name: nom.nominatorName, email: nom.nominatorEmail, affiliation: nom.nominatorAffiliation },
    fields: nominationData(nom), files: Object.keys(nominationFiles(nom)),
    endorsers: activeEndorsements(nom.id).map(function (e) {
      return { id: e.id, name: e.name, email: e.email, affiliation: e.affiliation, relationship: e.relationship,
        nonSupervisee: e.nonSupervisee === true || e.nonSupervisee === 'TRUE', status: e.status,
        invitedAt: iso(e.invitedAt), submittedAt: iso(e.submittedAt), declineReason: e.declineReason };
    })
  };
}

function endorserView(token) {
  var e = token && findOne('Endorsements', 'token', token);
  if (!e || e.status === 'removed') throw new Error('This link is not valid, or the nominator no longer needs this letter.');
  var nom = findOne('Nominations', 'id', e.nominationId);
  if (nom.status !== 'active') throw new Error('This nomination is no longer active, so no letter is needed. Thank you.');
  return {
    award: nom.award, title: nom.title, fields: nominationData(nom), files: Object.keys(nominationFiles(nom)),
    nominator: { name: nom.nominatorName, affiliation: nom.nominatorAffiliation },
    me: { name: e.name, status: e.status, submittedAt: iso(e.submittedAt), hasLetter: !!e.fileId,
      nonSupervisee: e.nonSupervisee === true || e.nonSupervisee === 'TRUE' }
  };
}

function iso(d) { return d instanceof Date ? d.toISOString() : (d || ''); }

// ---------------------------------------------------------------- API

function apiUpload(upload) {
  return { id: stageUpload(upload) };
}

function apiSubmitNomination(p) {
  var award = AWARDS[p.award];
  if (!award) throw new Error('Unknown award.');
  // Spam trap: a hidden field people never see. Pretend it worked.
  if (p.website) return { ok: true, id: 'received' };
  var cycle = cycleFor(new Date());
  var fields = cleanFields(award, p.fields || {});
  var files = p.files || {};
  var nominator = { name: trim(p.nominator && p.nominator.name), email: trim(p.nominator && p.nominator.email),
    affiliation: trim(p.nominator && p.nominator.affiliation) };
  var endorsers = (p.endorsers || []).map(cleanEndorser);

  var errs = validateFields(award, fields, files, cycle);
  if (!nominator.name) errs['nominator.name'] = 'Required.';
  if (!isEmail(nominator.email)) errs['nominator.email'] = 'Not a valid e-mail address.';
  if (!nominator.affiliation) errs['nominator.affiliation'] = 'Required.';
  if (!p.notNominee) errs['notNominee'] = 'Self-nominations are not accepted.';
  if (!p.nominatorEligible) errs['nominatorEligible'] = 'Please confirm you are eligible to nominate under the ACM conflict of interest policy.';
  if (award.checkEligibility && !p.eligible) errs['eligible'] = 'Please confirm the nominee is eligible.';
  var nomineeEmail = award.nomineeEmailKey ? fields[award.nomineeEmailKey] : '';
  if (nomineeEmail && normEmail(nomineeEmail) === normEmail(nominator.email)) {
    errs[award.nomineeEmailKey] = 'Self-nominations are not accepted.';
  }
  var er = validateEndorsers(award, endorsers, { nomineeEmail: nomineeEmail, nominatorEmail: nominator.email });
  if (hasErrors(errs, er)) return { ok: false, errors: errs, endorserErrors: er };


  var nom = withLock(function () {
    var id = newNominationId(cycle);
    var title = fields[award.titleKey];
    var folder = awardFolder(p.award).createFolder(id + ' – ' + safeName(title));
    var fileIds = {};
    award.fields.forEach(function (f) {
      if (f.type === 'file' && files[f.key]) fileIds[f.key] = adoptStaged(files[f.key], folder, f.label);
    });
    var now = new Date();
    var n = append('Nominations', {
      id: id, award: p.award, firstCycle: cycle, lastCycle: cycle + award.activeCycles - 1, status: 'unconfirmed',
      title: title, nomineeEmail: nomineeEmail || '', nominatorName: nominator.name, nominatorEmail: nominator.email,
      nominatorAffiliation: nominator.affiliation, source: 'web', created: now, updated: now,
      folderUrl: folder.getUrl(), token: newToken(), data: JSON.stringify(fields), files: JSON.stringify(fileIds),
      notes: ''
    });
    endorsers.forEach(function (e, i) { addEndorsement(n, e, i + 1); });
    refreshLetterCount(n);
    log('nominate', id, nominator.email, { award: p.award, title: title, nominatorEligible: true, nomineeEligible: !!award.checkEligibility });
    return n;
  });

  // Nothing else happens until the nominator proves they own the address:
  // the private link goes only to that inbox, and opening it asks them to confirm.
  mailConfirmNomination(nom);
  return { ok: true, id: nom.id };
}

/**
 * The nominator clicked "Confirm" on the page their e-mailed link opened.
 * (A button, not the link itself, so mail scanners that open links can't confirm.)
 */
function apiConfirm(token) {
  var nom = token && findOne('Nominations', 'token', token);
  if (!nom) throw new Error('This link is not valid.');
  if (nom.status === 'unconfirmed') {
    var award = AWARDS[nom.award];
    withLock(function () {
      var now = new Date();
      var cycle = cycleFor(now);
      nom.status = 'active';
      nom.confirmedAt = now;
      nom.updated = now;
      nom.firstCycle = cycle;
      nom.lastCycle = cycle + award.activeCycles - 1;
      save('Nominations', nom, ['status', 'confirmedAt', 'updated', 'firstCycle', 'lastCycle']);
      endorsementsOf(nom.id).forEach(function (e) {
        e.invitedAt = now;
        save('Endorsements', e, ['invitedAt']);
      });
      log('confirm', nom.id, nom.nominatorEmail, '');
    });
    activeEndorsements(nom.id).forEach(function (e) { mailEndorserInvite(nom, e); });
    mailNominationReceived(nom);
    mailAdmins('New nomination ' + nom.id + ': ' + nom.title + ' (' + award.short + ')',
      adminSummaryHtml(nom));
    buildSummary(nom);
  }
  return { ok: true, nomination: nominatorView(token) };
}

function apiUpdateNomination(token, p) {
  var nom = activeNomination(token);
  var award = AWARDS[nom.award];
  var cycle = cycleFor(new Date());
  var fields = cleanFields(award, p.fields || {});
  var old = nominationFiles(nom);
  var present = {};
  Object.keys(old).forEach(function (k) { present[k] = true; });
  Object.keys(p.files || {}).forEach(function (k) { present[k] = true; });
  var errs = validateFields(award, fields, present, cycle);
  if (award.nomineeEmailKey && normEmail(fields[award.nomineeEmailKey]) === normEmail(nom.nominatorEmail)) {
    errs[award.nomineeEmailKey] = 'Self-nominations are not accepted.';
  }
  if (Object.keys(errs).length) return { ok: false, errors: errs };

  withLock(function () {
    var folder = nominationFolder(nom);
    award.fields.forEach(function (f) {
      var staged = p.files && p.files[f.key];
      if (f.type !== 'file' || !staged) return;
      if (old[f.key]) {
        try { DriveApp.getFileById(old[f.key]).setTrashed(true); } catch (e) { /* already gone */ }
      }
      old[f.key] = adoptStaged(staged, folder, f.label);
    });
    var changed = award.fields.filter(function (f) {
      return f.type !== 'file' && String(nominationData(nom)[f.key] || '') !== String(fields[f.key] || '');
    }).map(function (f) { return f.label; }).concat(Object.keys(p.files || {}).map(function (k) {
      return award.fields.filter(function (f) { return f.key === k; })[0].label + ' (new file)';
    }));
    nom.data = JSON.stringify(fields);
    nom.files = JSON.stringify(old);
    nom.title = fields[award.titleKey];
    nom.nomineeEmail = award.nomineeEmailKey ? fields[award.nomineeEmailKey] : '';
    nom.updated = new Date();
    save('Nominations', nom, ['data', 'files', 'title', 'nomineeEmail', 'updated']);
    log('update', nom.id, nom.nominatorEmail, { changed: changed });
    mailAdmins('Nomination ' + nom.id + ' updated: ' + nom.title, '<p>Changed: ' + esc(changed.join(', ') || 'nothing') +
      '</p>' + adminSummaryHtml(nom));
  });
  buildSummary(nom);
  return { ok: true, nomination: nominatorView(token) };
}

function apiAddEndorser(token, endorser) {
  var nom = activeNomination(token);
  var award = AWARDS[nom.award];
  var e = cleanEndorser(endorser);
  var list = activeEndorsements(nom.id).map(function (x) {
    return { name: x.name, email: x.email, affiliation: x.affiliation, nonSupervisee: x.nonSupervisee === true };
  });
  var probe = list.concat([e]);
  var er = validateEndorsers(award, probe, { nomineeEmail: nom.nomineeEmail, nominatorEmail: nom.nominatorEmail });
  var mine = er.errors[probe.length - 1];
  var tooMany = probe.length > award.endorsers.max;
  if (mine || tooMany) return { ok: false, errors: mine || {}, general: tooMany ? [er.general[0]] : [] };
  var row = withLock(function () {
    var r = addEndorsement(nom, e, endorsementsOf(nom.id).length + 1);
    refreshLetterCount(nom);
    log('add-endorser', nom.id, nom.nominatorEmail, { endorser: e.email });
    return r;
  });
  mailEndorserInvite(nom, row);
  buildSummary(nom);
  return { ok: true, nomination: nominatorView(token) };
}

function apiRemoveEndorser(token, endorsementId) {
  var nom = activeNomination(token);
  var e = findOne('Endorsements', 'id', endorsementId);
  if (!e || e.nominationId !== nom.id) throw new Error('Not found.');
  var wasInvited = e.status === 'invited';
  withLock(function () {
    e.status = 'removed';
    save('Endorsements', e, ['status']);
    refreshLetterCount(nom);
    log('remove-endorser', nom.id, nom.nominatorEmail, { endorser: e.email });
  });
  if (wasInvited) mailEndorserReleased(nom, e);
  buildSummary(nom);
  return { ok: true, nomination: nominatorView(token) };
}

function apiResendInvite(token, endorsementId) {
  var nom = activeNomination(token);
  var e = findOne('Endorsements', 'id', endorsementId);
  if (!e || e.nominationId !== nom.id || e.status !== 'invited') throw new Error('Only pending invitations can be resent.');
  mailEndorserInvite(nom, e, true);
  e.lastReminder = new Date();
  save('Endorsements', e, ['lastReminder']);
  log('resend', nom.id, nom.nominatorEmail, { endorser: e.email });
  return { ok: true };
}

function apiWithdraw(token) {
  var nom = activeNomination(token);
  withLock(function () {
    nom.status = 'withdrawn';
    nom.updated = new Date();
    save('Nominations', nom, ['status', 'updated']);
    log('withdraw', nom.id, nom.nominatorEmail, '');
  });
  activeEndorsements(nom.id).filter(function (e) { return e.status === 'invited'; })
    .forEach(function (e) { mailEndorserReleased(nom, e); });
  mailAdmins('Nomination ' + nom.id + ' withdrawn: ' + nom.title, adminSummaryHtml(nom));
  return { ok: true, nomination: nominatorView(token) };
}

/** kind: 'n' (nominator) or 'e' (endorser). Returns a nomination file as base64. */
function apiGetFile(kind, token, key) {
  var nom;
  if (kind === 'n') nom = findOne('Nominations', 'token', token);
  if (kind === 'e') {
    var e = findOne('Endorsements', 'token', token);
    if (e && e.status !== 'removed') nom = findOne('Nominations', 'id', e.nominationId);
  }
  if (!token || !nom) throw new Error('This link is not valid.');
  var id = nominationFiles(nom)[key];
  if (!id) throw new Error('No such file.');
  var blob = DriveApp.getFileById(id).getBlob();
  return { name: safeName(nom.title) + ' – ' + blob.getName(), data: Utilities.base64Encode(blob.getBytes()) };
}

function apiSubmitEndorsement(token, stagedId, eligible) {
  var e = findOne('Endorsements', 'token', token);
  if (!token || !e || e.status === 'removed') throw new Error('This link is not valid.');
  var nom = findOne('Nominations', 'id', e.nominationId);
  if (nom.status !== 'active') throw new Error('This nomination is no longer active.');
  if (!eligible) throw new Error('Please confirm you are eligible to endorse under the ACM conflict of interest policy.');
  var replacing = !!e.fileId;
  withLock(function () {
    if (e.fileId) {
      try { DriveApp.getFileById(e.fileId).setTrashed(true); } catch (x) { /* already gone */ }
    }
    e.fileId = adoptStaged(stagedId, nominationFolder(nom), 'Letter – ' + safeName(e.name));
    e.status = 'submitted';
    e.submittedAt = new Date();
    e.declineReason = '';
    save('Endorsements', e, ['fileId', 'status', 'submittedAt', 'declineReason']);
    refreshLetterCount(nom);
    log(replacing ? 'letter-replaced' : 'letter', nom.id, e.email, 'endorser confirmed own eligibility (ACM COI policy)');
  });
  if (!replacing) {
    mailEndorserThanks(nom, e);
    mailNominatorEndorserUpdate(nom, e);
  }
  buildSummary(nom);
  return { ok: true, endorsement: endorserView(token) };
}

function apiDeclineEndorsement(token, reason) {
  var e = findOne('Endorsements', 'token', token);
  if (!token || !e || e.status === 'removed') throw new Error('This link is not valid.');
  var nom = findOne('Nominations', 'id', e.nominationId);
  withLock(function () {
    if (e.fileId) {
      try { DriveApp.getFileById(e.fileId).setTrashed(true); } catch (x) { /* already gone */ }
    }
    e.fileId = '';
    e.status = 'declined';
    e.declineReason = String(reason || '').slice(0, 500);
    save('Endorsements', e, ['fileId', 'status', 'declineReason']);
    refreshLetterCount(nom);
    log('decline', nom.id, e.email, e.declineReason);
  });
  mailNominatorEndorserUpdate(nom, e);
  buildSummary(nom);
  return { ok: true, endorsement: endorserView(token) };
}

// ---------------------------------------------------------------- helpers

function trim(s) { return String(s == null ? '' : s).trim(); }

function cleanFields(award, raw) {
  var out = {};
  award.fields.forEach(function (f) {
    if (f.type !== 'file') out[f.key] = trim(raw[f.key]).slice(0, 20000);
  });
  return out;
}

function cleanEndorser(e) {
  e = e || {};
  return { name: trim(e.name).slice(0, 200), email: trim(e.email).slice(0, 200),
    affiliation: trim(e.affiliation).slice(0, 200), relationship: trim(e.relationship).slice(0, 300),
    nonSupervisee: e.nonSupervisee === true };
}

function addEndorsement(nom, e, seq) {
  return append('Endorsements', {
    id: nom.id + '-L' + seq, nominationId: nom.id, name: e.name, email: e.email, affiliation: e.affiliation,
    relationship: e.relationship, nonSupervisee: !!e.nonSupervisee, status: 'invited', invitedAt: new Date(),
    token: newToken()
  });
}

function activeNomination(token) {
  var nom = token && findOne('Nominations', 'token', token);
  if (!nom) throw new Error('This link is not valid.');
  if (nom.status !== 'active') throw new Error('This nomination is ' + nom.status + ' and can no longer be changed.');
  return nom;
}

function pageUrl() { return CONFIG.siteUrl || ScriptApp.getService().getUrl(); }
function statusUrl(nom) { return pageUrl() + '?n=' + nom.token; }
function endorseUrl(e) { return pageUrl() + '?e=' + e.token; }

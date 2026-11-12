/**
 * Storage: one Google Sheet (the admin dashboard) and one Drive folder tree.
 *
 *   Nominations   one row per nomination
 *   Endorsements  one row per invited endorser
 *   Import        nominations received by e-mail, to be imported
 *   Log           every action, for auditing
 *
 * Drive: <root>/<Award short name>/<id> – <title>/  holds the nomination's files.
 *        <root>/_staging/ holds uploads until the form is submitted.
 */

var SHEETS = {
  Nominations: ['id', 'award', 'firstCycle', 'lastCycle', 'status', 'title', 'nomineeEmail',
    'nominatorName', 'nominatorEmail', 'nominatorAffiliation', 'letters', 'source', 'created', 'confirmedAt', 'updated',
    'folderUrl', 'token', 'carryNoticeCycle', 'data', 'files', 'notes'],
  Endorsements: ['id', 'nominationId', 'name', 'email', 'affiliation', 'relationship', 'nonSupervisee',
    'status', 'invitedAt', 'lastReminder', 'submittedAt', 'fileId', 'declineReason', 'token'],
  Import: ['award', 'firstCycle', 'title', 'nomineeEmail', 'nominatorName', 'nominatorEmail',
    'nominatorAffiliation', 'citation', 'description', 'filesFolderUrl', 'endorsers', 'importedId'],
  Log: ['time', 'action', 'nominationId', 'who', 'details']
};

// unconfirmed: submitted, nominator has not yet clicked the link e-mailed to them.
// abandoned: never confirmed (cleared after 14 days).
var NOMINATION_STATUSES = ['unconfirmed', 'active', 'withdrawn', 'awarded', 'expired', 'abandoned'];
var ENDORSEMENT_STATUSES = ['invited', 'submitted', 'declined', 'removed'];

function props() { return PropertiesService.getScriptProperties(); }

function ss() {
  var id = props().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  return SpreadsheetApp.openById(id);
}

function rootFolder() { return DriveApp.getFolderById(props().getProperty('ROOT_FOLDER_ID')); }

function stagingFolder() { return DriveApp.getFolderById(props().getProperty('STAGING_FOLDER_ID')); }

function sheet(name) { return ss().getSheetByName(name); }

/** All rows of a sheet as objects (with _row = 1-based sheet row). */
function readAll(name) {
  var sh = sheet(name);
  var values = sh.getDataRange().getValues();
  var head = values.shift();
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  }).filter(function (o) { return String(o[head[0]]) !== ''; });
}

function findOne(name, key, value) {
  var rows = readAll(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][key]) === String(value)) return rows[i];
  return null;
}

function append(name, obj) {
  var sh = sheet(name);
  sh.appendRow(SHEETS[name].map(function (h) { return obj[h] == null ? '' : obj[h]; }));
  obj._row = sh.getLastRow();
  return obj;
}

/** Write back the given fields of a row object. */
function save(name, obj, keys) {
  var sh = sheet(name);
  var head = SHEETS[name];
  (keys || head).forEach(function (k) {
    var c = head.indexOf(k);
    if (c >= 0) sh.getRange(obj._row, c + 1).setValue(obj[k] == null ? '' : obj[k]);
  });
}

function log(action, nominationId, who, details) {
  append('Log', { time: new Date(), action: action, nominationId: nominationId || '', who: who || '',
    details: typeof details === 'string' ? details : JSON.stringify(details || {}) });
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function newToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function newNominationId(cycle) {
  var n = readAll('Nominations').filter(function (r) { return String(r.id).indexOf(cycle + '-') === 0; }).length;
  return cycle + '-' + ('00' + (n + 1)).slice(-3);
}

function nominationData(nom) { return nom.data ? JSON.parse(nom.data) : {}; }
function nominationFiles(nom) { return nom.files ? JSON.parse(nom.files) : {}; }

function endorsementsOf(nominationId) {
  return readAll('Endorsements').filter(function (e) { return e.nominationId === nominationId; });
}

function activeEndorsements(nominationId) {
  return endorsementsOf(nominationId).filter(function (e) { return e.status !== 'removed'; });
}

/** Count of letters in, for the dashboard column, e.g. "2/3". */
function refreshLetterCount(nom) {
  var es = activeEndorsements(nom.id).filter(function (e) { return e.status !== 'declined'; });
  nom.letters = es.length ? es.filter(function (e) { return e.status === 'submitted'; }).length + '/' + es.length : '';
  save('Nominations', nom, ['letters']);
}

function nominationFolder(nom) {
  return DriveApp.getFolderById(nom.folderUrl.match(/folders\/([\w-]+)/)[1]);
}

function awardFolder(awardKey) {
  var name = AWARDS[awardKey].short;
  var it = rootFolder().getFoldersByName(name);
  return it.hasNext() ? it.next() : rootFolder().createFolder(name);
}

/** Store a base64 upload in the staging folder; returns the file id. */
function stageUpload(upload) {
  if (!upload || !upload.data) throw new Error('No file received.');
  var bytes = Utilities.base64Decode(upload.data);
  if (bytes.length > CONFIG.maxUploadMB * 1024 * 1024) throw new Error('Files must be under ' + CONFIG.maxUploadMB + ' MB.');
  if (!/pdf/i.test(upload.mimeType || '') && !/\.pdf$/i.test(upload.name || '')) throw new Error('Please upload a PDF.');
  var head = String.fromCharCode.apply(null, bytes.slice(0, 5));
  if (head !== '%PDF-') throw new Error('That file does not look like a PDF.');
  var blob = Utilities.newBlob(bytes, 'application/pdf', String(upload.name || 'upload.pdf').slice(0, 120));
  return stagingFolder().createFile(blob).getId();
}

/** Move a staged file into a nomination folder under a clear name. */
function adoptStaged(fileId, folder, name) {
  var f = DriveApp.getFileById(fileId);
  var parents = f.getParents();
  var staged = false;
  while (parents.hasNext()) if (parents.next().getId() === props().getProperty('STAGING_FOLDER_ID')) staged = true;
  if (!staged) throw new Error('Upload expired; please attach the file again.');
  f.setName(name + '.pdf');
  f.moveTo(folder);
  return f.getId();
}

function safeName(s) { return String(s || '').replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }

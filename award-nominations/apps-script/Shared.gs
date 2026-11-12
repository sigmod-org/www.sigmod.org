/**
 * Helpers used both by the server and in the browser. The page gets the
 * source of these functions through sharedSource() in Code.gs, so keep them
 * self-contained: no Apps Script services, no globals except CONFIG/AWARDS.
 */

function countWords(s) {
  s = String(s == null ? '' : s).trim();
  return s ? s.split(/\s+/).length : 0;
}

function normEmail(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

function isEmail(s) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(s == null ? '' : s).trim());
}

function normName(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-zÀ-ɏ]+/g, ' ').trim();
}

/** End of the cut-off day for a cycle, Anywhere on Earth, as a Date. */
function deadlineFor(cycle) {
  var d = CONFIG.deadline;
  // 23:59:59 at UTC-12 is 11:59:59 UTC the next day.
  return new Date(Date.UTC(cycle, d.month - 1, d.day + 1, 11, 59, 59));
}

/** The cycle (award year) a nomination made at `date` is first considered for. */
function cycleFor(date) {
  var y = date.getUTCFullYear();
  return date.getTime() <= deadlineFor(y).getTime() ? y : y + 1;
}

function fieldOptions(field, cycle) {
  if (field.optionsFrom === 'totYears') {
    return [cycle - 12, cycle - 11, cycle - 10].map(String);
  }
  return field.options || [];
}

/**
 * Validate the nomination fields.
 * fields: {key: string}; files: {key: truthy if a file is present}.
 * Returns {key: message} for every invalid field.
 */
function validateFields(award, fields, files, cycle) {
  var errors = {};
  award.fields.forEach(function (f) {
    var v = fields[f.key];
    var s = String(v == null ? '' : v).trim();
    if (f.type === 'file') {
      if (f.required && !files[f.key]) errors[f.key] = 'Please attach a PDF.';
      return;
    }
    if (!s) {
      if (f.required) errors[f.key] = 'Required.';
      return;
    }
    if (f.type === 'email' && !isEmail(s)) errors[f.key] = 'Not a valid e-mail address.';
    if (f.type === 'url' && !/^(https?:\/\/|10\.\d{4,}\/)/i.test(s)) errors[f.key] = 'Enter a link (https://…) or a DOI (10.…).';
    if (f.type === 'select' && fieldOptions(f, cycle).indexOf(s) < 0) errors[f.key] = 'Choose one of the options.';
    var w = countWords(s);
    if (f.maxWords && w > f.maxWords) errors[f.key] = w + ' words; the limit is ' + f.maxWords + '.';
    if (f.minWords && w < f.minWords) errors[f.key] = w + ' words; at least ' + f.minWords + ' are needed.';
  });
  return errors;
}

/**
 * Validate the list of endorsers (only those still active).
 * ctx: {nomineeEmail, nominatorEmail}. Returns {errors: {index: {field: msg}}, general: [msg]}.
 */
function validateEndorsers(award, endorsers, ctx) {
  var rules = award.endorsers;
  var out = { errors: {}, general: [] };
  var seen = {};
  endorsers.forEach(function (e, i) {
    var err = {};
    if (!String(e.name || '').trim()) err.name = 'Required.';
    if (!String(e.affiliation || '').trim()) err.affiliation = 'Required.';
    if (!isEmail(e.email)) err.email = 'Not a valid e-mail address.';
    var em = normEmail(e.email);
    if (em && ctx.nomineeEmail && em === normEmail(ctx.nomineeEmail)) err.email = 'The nominee cannot write a supporting letter.';
    if (em && ctx.nominatorEmail && em === normEmail(ctx.nominatorEmail)) err.email = 'The nominator cannot also write a supporting letter.';
    if (em && seen[em]) err.email = 'Listed twice.';
    seen[em] = true;
    if (Object.keys(err).length) out.errors[i] = err;
  });
  if (endorsers.length < rules.min) out.general.push('This award needs at least ' + rules.min + ' supporting letters.');
  if (endorsers.length > rules.max) {
    out.general.push(rules.max ? 'This award accepts at most ' + rules.max + ' supporting letters.' : rules.help);
  }
  if (rules.requireNonSupervisee && endorsers.length &&
      !endorsers.some(function (e) { return e.nonSupervisee; })) {
    out.general.push('At least one letter must come from someone the nominee did not directly supervise.');
  }
  return out;
}

function hasErrors(fieldErrors, endorserResult) {
  return Object.keys(fieldErrors || {}).length > 0 ||
    (endorserResult && (Object.keys(endorserResult.errors).length > 0 || endorserResult.general.length > 0));
}

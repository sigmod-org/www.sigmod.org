/**
 * SIGMOD award nominations: configuration.
 *
 * This file is plain data. It is read by the server (Apps Script) and also
 * sent to the browser, so it must not contain functions.
 */

var CONFIG = {
  org: 'ACM SIGMOD',
  senderName: 'ACM SIGMOD Awards',

  // Account that owns the script, the spreadsheet and the Drive folder.
  ownerEmail: 'sigmodec@gmail.com',

  // Replies to every e-mail the system sends go here.
  replyTo: 'sigmodec@gmail.com',

  // Who gets a copy of every new nomination, update and withdrawal (the
  // Awards Chair, the Secretary, ...) is NOT kept in this public file: set it
  // in the spreadsheet with Nominations → Set notification e-mails. It is
  // stored in the script's properties. Until it is set, notices go here:
  notifyFallback: ['sigmodec@gmail.com'],

  // While true, every e-mail (including the notices above) goes only to
  // testRecipients, with the intended recipient in the subject. Use it for
  // the dry run; set to false to go live.
  testMode: false,
  testRecipients: ['sigmodec@gmail.com'],

  // Annual cut-off: end of this day, Anywhere on Earth (UTC-12).
  deadline: { month: 2, day: 1 },

  // Endorsers who have not submitted get a reminder this many days before
  // the cut-off. Nominators get a summary of missing letters on
  // nominatorReminderDays.
  reminderDaysBefore: [14, 3],
  nominatorReminderDays: 7,

  // Nominators of nominations that carry over are asked to confirm or update
  // them on this date (month/day) before each cut-off.
  carryOverNotice: { month: 11, day: 15 },

  maxUploadMB: 10,

  // Shown on the forms of awards with checkEligibility: the nominator must tick
  // a box confirming it. Nothing is checked against a list.
  eligibilityRule: 'Current elected SIGMOD officers (Chair, Vice Chair, and Secretary/Treasurer) and members of the SIGMOD Awards Committee cannot be nominated while serving.',
  // Nominators and endorsers confirm their own eligibility under ACM's policy.
  coiUrl: 'https://awards.acm.org/awards-committees/conflict-of-interest',
  officersUrl: 'https://www.sigmod.org/about-sigmod/committees/',
  committeeUrl: 'https://www.sigmod.org/sigmod-awards/committees/sigmod-awards-committee/',

  // The public page on sigmod.org that hosts the forms. Links in e-mails
  // point here. Leave empty to use the Apps Script page itself.
  // For a local dry run use 'http://localhost:8080/sigmod-awards/nominate/'
  // (npm run serve in www.sigmod.org) together with testMode: true.
  siteUrl: 'https://www.sigmod.org/sigmod-awards/nominate/',

  // The web app's /exec URL (Deploy → Manage deployments). The sigmod.org
  // page sends its requests here. Run `node dev/build-site.mjs` after changing it.
  apiUrl: 'https://script.google.com/macros/s/AKfycbzzi23SQja5ClqVSglZ51X9UYLAJfXPCAHHkSL4eneNLsKkyHiUW_sYvX-KEYujGv-9/exec',

  callUrl: 'https://www.sigmod.org/sigmod-awards/ongoing-awards-call/',
  awardsUrl: 'https://www.sigmod.org/sigmod-awards/'
};

/**
 * Field types:
 *   text, email, url, textarea (minWords/maxWords), file (PDF), select
 *   (options, or optionsFrom: 'totYears'), lines (one entry per line).
 * Each award names the field that titles a nomination (titleKey) and, for
 * awards to a person, the nominee's e-mail (nomineeEmailKey).
 */
var NOMINEE_PERSON = [
  { key: 'nomineeName', label: 'Nominee name', type: 'text', required: true, section: 'Nominee' },
  { key: 'nomineeEmail', label: 'Nominee e-mail', type: 'email', required: true, section: 'Nominee' },
  { key: 'nomineeAffiliation', label: 'Nominee affiliation', type: 'text', required: true, section: 'Nominee' }
];

var CITATION = { key: 'citation', label: 'Proposed citation', type: 'textarea', rows: 2, required: true, maxWords: 25,
  help: 'Up to 25 words.', section: 'Nomination' };

var AWARDS = {
  codd: {
    name: 'SIGMOD Edgar F. Codd Innovations Award',
    short: 'Codd Innovations Award',
    url: 'https://www.sigmod.org/sigmod-awards/sigmod-edgar-f-codd-innovations-award/',
    blurb: 'For innovative and highly significant innovations of enduring value to the development, understanding, or use of data systems.',
    checkEligibility: true,
    activeCycles: 2,
    titleKey: 'nomineeName',
    nomineeEmailKey: 'nomineeEmail',
    fields: NOMINEE_PERSON.concat([
      CITATION,
      { key: 'description', label: 'Description of the innovation', type: 'textarea', rows: 8, required: true,
        minWords: 100, maxWords: 250, help: '100–250 words.', section: 'Nomination' },
      { key: 'statement', label: 'Nomination statement', type: 'file', required: true,
        help: 'A detailed statement justifying the nomination (PDF).', section: 'Nomination' },
      { key: 'cv', label: 'Nominee CV', type: 'file', required: true, help: 'PDF.', section: 'Nomination' }
    ]),
    endorsers: { min: 0, max: 3,
      help: 'Up to three supporting letters. Letters should convey additional facts, not simply endorse the nomination.' }
  },

  contributions: {
    name: 'SIGMOD Contributions Award',
    short: 'Contributions Award',
    url: 'https://www.sigmod.org/sigmod-awards/sigmod-contributions-award/',
    blurb: 'For outstanding service to the database field through new community initiatives, professional service, standards activities, and research funding.',
    checkEligibility: true,
    activeCycles: 2,
    titleKey: 'nomineeName',
    nomineeEmailKey: 'nomineeEmail',
    fields: NOMINEE_PERSON.concat([
      CITATION,
      { key: 'description', label: 'Description of the contribution', type: 'textarea', rows: 8, required: true,
        minWords: 100, maxWords: 250, help: '100–250 words.', section: 'Nomination' },
      { key: 'statement', label: 'Nomination statement', type: 'file', required: true,
        help: 'A detailed statement justifying the nomination (PDF).', section: 'Nomination' },
      { key: 'cv', label: 'Nominee CV', type: 'file', required: true, help: 'PDF.', section: 'Nomination' }
    ]),
    endorsers: { min: 0, max: 3,
      help: 'Up to three supporting letters. Letters should convey additional facts, not simply endorse the nomination.' }
  },

  mentorship: {
    name: 'SIGMOD Hector Garcia-Molina Distinguished Mentorship Award',
    short: 'Distinguished Mentorship Award',
    url: 'https://www.sigmod.org/hector-garcia-molina-2025-sigmod-distinguished-mentorship-award/',
    blurb: 'For innovation and/or sustained excellence in mentoring, broadly defined, within the data management community.',
    checkEligibility: true,
    activeCycles: 3,
    titleKey: 'nomineeName',
    nomineeEmailKey: 'nomineeEmail',
    fields: NOMINEE_PERSON.concat([
      { key: 'statement', label: 'Nomination letter', type: 'file', required: true,
        help: 'Up to 2 pages (PDF).', section: 'Nomination' }
    ]),
    endorsers: { min: 3, max: 5, requireNonSupervisee: true,
      help: 'At least three supporting letters, at least one from someone the nominee did not directly supervise.' }
  },

  systems: {
    name: 'SIGMOD Systems Award',
    short: 'Systems Award',
    url: 'https://www.sigmod.org/sigmod-awards/sigmod-systems-award/',
    blurb: 'For a software or hardware system whose technical contributions have had significant impact on the theory or practice of large-scale data management systems.',
    checkEligibility: true,
    activeCycles: 2,
    titleKey: 'systemName',
    fields: [
      { key: 'systemName', label: 'System', type: 'text', required: true, section: 'System' },
      { key: 'nominees', label: 'Individuals to be recognized', type: 'lines', rows: 5, required: true,
        help: 'One per line: name, affiliation, e-mail.', section: 'System' },
      CITATION,
      { key: 'description', label: 'Description of the innovation and contribution', type: 'textarea', rows: 8,
        required: true, minWords: 100, maxWords: 250,
        help: '100–250 words, justifying the system’s significance and the choice of nominees.', section: 'Nomination' },
      { key: 'supporting', label: 'Additional material (optional)', type: 'file', required: false,
        help: 'PDF.', section: 'Nomination' }
    ],
    endorsers: { min: 0, max: 3,
      help: 'Up to three supporting letters. Letters should convey additional facts, not simply endorse the nomination.' }
  },

  testoftime: {
    name: 'SIGMOD Test of Time Award',
    short: 'Test of Time Award',
    url: 'https://www.sigmod.org/sigmod-awards/sigmod-test-of-time-award/',
    blurb: 'For the paper from the SIGMOD proceedings 10–12 years earlier that has had the most impact over the intervening decade.',
    activeCycles: 2,
    titleKey: 'paperTitle',
    fields: [
      { key: 'paperTitle', label: 'Paper title', type: 'text', required: true, section: 'Paper' },
      { key: 'paperAuthors', label: 'Authors', type: 'text', required: true, section: 'Paper' },
      { key: 'paperYear', label: 'SIGMOD proceedings year', type: 'select', optionsFrom: 'totYears', required: true,
        section: 'Paper' },
      { key: 'paperUrl', label: 'DOI or ACM Digital Library link', type: 'url', required: true, section: 'Paper' },
      { key: 'justification', label: 'Justification', type: 'textarea', rows: 14, required: true, maxWords: 750,
        help: 'Up to 750 words.', section: 'Nomination' }
    ],
    endorsers: { min: 0, max: 0, help: 'Supporting letters are not accepted for this award.' }
  }
};

var AWARD_ORDER = ['codd', 'contributions', 'mentorship', 'systems', 'testoftime'];

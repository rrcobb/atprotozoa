// Load the pulled raw data into a single SQLite DB (audit/audit.db) so mentions,
// sites, provenance, HTTP checks, and GitHub runs can be joined for the map.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const here = (p) => new URL(p, import.meta.url);
const j = (p) => JSON.parse(readFileSync(here(p), "utf8"));

const events = j("./raw/logs.json").events;
const provenance = j("./raw/provenance.json");
const http = j("./raw/site-http.json");
const runs = j("./raw/gh-runs.json");

const dbPath = new URL("./audit.db", import.meta.url).pathname;
// fresh db each run
execFileSync("rm", ["-f", dbPath]);
const db = new DatabaseSync(dbPath);

db.exec(`
CREATE TABLE events (
  mentionUri TEXT PRIMARY KEY,
  authorHandle TEXT, authorDid TEXT, text TEXT, isReply INTEGER,
  firstSeen TEXT, updatedAt TEXT, mutual INTEGER, dispatched INTEGER,
  outcomeStatus TEXT, builtName TEXT, url TEXT, liveVerified INTEGER,
  partial INTEGER, outcomeAt TEXT, replyText TEXT
);
CREATE TABLE provenance (
  siteDir TEXT PRIMARY KEY, builtName TEXT, requestedBy TEXT,
  brief TEXT, note TEXT, mentionUri TEXT, builtAt TEXT, builtBy TEXT
);
CREATE TABLE http (
  name TEXT PRIMARY KEY, url TEXT, status INTEGER, finalUrl TEXT,
  redirected INTEGER, error TEXT, title TEXT, routes TEXT,
  custom_domain INTEGER, workers_dev INTEGER, bytes INTEGER
);
CREATE TABLE runs (
  databaseId INTEGER PRIMARY KEY, workflowName TEXT, event TEXT,
  conclusion TEXT, displayTitle TEXT, createdAt TEXT
);
`);

const insEvent = db.prepare(`INSERT OR REPLACE INTO events VALUES
 (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const e of events) {
  const o = e.outcome || {};
  insEvent.run(
    e.mentionUri, e.authorHandle ?? null, e.authorDid ?? null, e.text ?? null,
    e.isReply ? 1 : 0, e.firstSeen ?? null, e.updatedAt ?? null,
    e.mutual === undefined ? null : e.mutual ? 1 : 0,
    e.dispatched === undefined ? null : e.dispatched ? 1 : 0,
    o.status ?? null, o.builtName ?? null, o.url ?? null,
    o.liveVerified === undefined ? null : o.liveVerified ? 1 : 0,
    o.partial ? 1 : 0, o.at ?? null, o.replyText ?? null,
  );
}

const insProv = db.prepare(`INSERT OR REPLACE INTO provenance VALUES (?,?,?,?,?,?,?,?)`);
for (const p of provenance) {
  insProv.run(
    p.siteDir?.replace(/^.*\//, "") ?? null, p.builtName ?? null, p.requestedBy ?? null,
    p.brief ?? null, p.note ?? null, p.mentionUri ?? null, p.builtAt ?? null, p.builtBy ?? null,
  );
}

const insHttp = db.prepare(`INSERT OR REPLACE INTO http VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
for (const h of http) {
  insHttp.run(
    h.name, h.url ?? null, h.status ?? null, h.finalUrl ?? null,
    h.redirected ? 1 : 0, h.error ?? null, h.title ?? null, h.routes ?? null,
    h.custom_domain ? 1 : 0, h.workers_dev ? 1 : 0, h.bytes ?? null,
  );
}

const insRun = db.prepare(`INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?)`);
for (const r of runs) {
  insRun.run(r.databaseId, r.workflowName, r.event, r.conclusion, r.displayTitle, r.createdAt);
}

console.log("events:", db.prepare("SELECT count(*) c FROM events").get().c);
console.log("provenance:", db.prepare("SELECT count(*) c FROM provenance").get().c);
console.log("http:", db.prepare("SELECT count(*) c FROM http").get().c);
console.log("runs:", db.prepare("SELECT count(*) c FROM runs").get().c);
db.close();
console.log("wrote", dbPath);

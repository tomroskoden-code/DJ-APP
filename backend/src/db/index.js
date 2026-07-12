/* =======================================================================
   DATENBANK-ADAPTER (SQLite via better-sqlite3)

   Dieses Modul ist die EINZIGE Stelle im Projekt, die better-sqlite3
   direkt anspricht. Alle Repositories greifen ausschließlich über die
   hier exportierten Funktionen auf die Datenbank zu.

   Für einen späteren Wechsel zu PostgreSQL muss nur dieses Modul
   ausgetauscht werden (z.B. mit einem pg.Pool). Damit das ohne Änderungen
   an Repositories und Routen klappt, sind alle Funktionen bereits als
   async deklariert, obwohl better-sqlite3 synchron arbeitet:
     - all(sql, params)  -> alle Treffer als Array
     - get(sql, params)  -> erster Treffer oder undefined
     - run(sql, params)  -> { lastInsertId, changes }
     - exec(sql)         -> mehrere Statements ohne Parameter (z.B. Schema)
     - transaction(fn)   -> führt fn innerhalb einer Transaktion aus

   Hinweis: Platzhalter sind SQLite-Stil ("?"). Ein PostgreSQL-Adapter
   kann diese mechanisch in $1, $2, ... übersetzen.
   ======================================================================= */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Speicherort der SQLite-Datei; per Umgebungsvariable DB_FILE übersteuerbar
// (praktisch für Tests, z.B. DB_FILE=":memory:").
const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "..", "data", "beatspot.db");

// Datenverzeichnis bei Bedarf anlegen (":memory:" braucht keins)
if (DB_FILE !== ":memory:") {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

const db = new Database(DB_FILE);

// Fremdschlüssel-Prüfung muss in SQLite pro Verbindung aktiviert werden
db.pragma("foreign_keys = ON");
// WAL-Modus: bessere Parallelität von Lese-/Schreibzugriffen
db.pragma("journal_mode = WAL");

/** Liefert alle Treffer einer SELECT-Abfrage als Array. */
export async function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

/** Liefert den ersten Treffer einer SELECT-Abfrage oder undefined. */
export async function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

/** Führt INSERT/UPDATE/DELETE aus; liefert neue ID und Anzahl geänderter Zeilen. */
export async function run(sql, params = []) {
  const result = db.prepare(sql).run(...params);
  return {
    lastInsertId: Number(result.lastInsertRowid),
    changes: result.changes,
  };
}

/** Führt mehrere Statements ohne Parameter aus (z.B. Schema-Skripte). */
export async function exec(sql) {
  db.exec(sql);
}

/**
 * Führt fn innerhalb einer Transaktion aus (Rollback bei Fehler).
 * fn darf die anderen Adapter-Funktionen verwenden. Verschachtelte Aufrufe
 * werden über SAVEPOINTs abgebildet (funktioniert in SQLite und PostgreSQL
 * identisch) – erst die äußerste Ebene schreibt endgültig (COMMIT).
 */
let txDepth = 0;

export async function transaction(fn) {
  const level = txDepth++;
  if (level === 0) db.exec("BEGIN");
  else db.exec(`SAVEPOINT sp_${level}`);

  try {
    const result = await fn();
    txDepth--;
    if (level === 0) db.exec("COMMIT");
    else db.exec(`RELEASE SAVEPOINT sp_${level}`);
    return result;
  } catch (err) {
    txDepth--;
    if (level === 0) {
      db.exec("ROLLBACK");
    } else {
      db.exec(`ROLLBACK TO SAVEPOINT sp_${level}`);
      db.exec(`RELEASE SAVEPOINT sp_${level}`);
    }
    throw err;
  }
}

/** Legt alle Tabellen an, falls sie noch nicht existieren (idempotent). */
export async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
}

/** Schließt die Datenbankverbindung (z.B. beim Herunterfahren). */
export async function close() {
  db.close();
}

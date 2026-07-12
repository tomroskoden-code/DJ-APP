/* =======================================================================
   REPOSITORY: events

   Kapselt sämtliche SQL-Zugriffe auf die Tabellen events und event_lineup.
   Das Lineup wird als Verknüpfungstabelle zu djs gepflegt und in den
   API-Antworten – wie im Prototyp – als Array von DJ-Namen ausgegeben
   (zusätzlich als lineupIds für Programmzugriffe).
   ======================================================================= */

import * as db from "../db/index.js";

// Wandelt eine Datenbankzeile plus Lineup in das API-Format um
function rowToEvent(row, lineup) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    city: row.city,
    date: row.date,
    dayLabel: row.day_label,
    time: row.time,
    lineup: lineup.map((l) => l.name), // DJ-Namen, wie im Mock
    lineupIds: lineup.map((l) => l.dj_id),
    entry: row.entry,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
  };
}

// Lädt die Lineup-Einträge (DJ-ID + Name) für eine Menge von Event-IDs
async function loadLineups(eventIds) {
  if (eventIds.length === 0) return new Map();
  const placeholders = eventIds.map(() => "?").join(", ");
  const rows = await db.all(
    `SELECT el.event_id, el.dj_id, d.name
       FROM event_lineup el
       JOIN djs d ON d.id = el.dj_id
      WHERE el.event_id IN (${placeholders})
      ORDER BY el.position`,
    eventIds
  );
  const byEvent = new Map(eventIds.map((id) => [id, []]));
  for (const row of rows) byEvent.get(row.event_id).push(row);
  return byEvent;
}

/** Events abrufen, optional nach Stadt gefiltert. */
export async function listEvents({ city } = {}) {
  const where = city ? "WHERE city = ?" : "";
  const rows = await db.all(`SELECT * FROM events ${where} ORDER BY id`, city ? [city] : []);
  const lineups = await loadLineups(rows.map((r) => r.id));
  return rows.map((row) => rowToEvent(row, lineups.get(row.id)));
}

/** Einzelnes Event per ID laden (oder null). */
export async function getEvent(id) {
  const row = await db.get("SELECT * FROM events WHERE id = ?", [id]);
  if (!row) return null;
  const lineups = await loadLineups([row.id]);
  return rowToEvent(row, lineups.get(row.id));
}

// Ersetzt das Lineup eines Events komplett durch die übergebenen DJ-IDs
async function replaceLineup(eventId, djIds) {
  await db.run("DELETE FROM event_lineup WHERE event_id = ?", [eventId]);
  for (let i = 0; i < djIds.length; i++) {
    await db.run(
      "INSERT INTO event_lineup (event_id, dj_id, position) VALUES (?, ?, ?)",
      [eventId, djIds[i], i]
    );
  }
}

/** Neues Event anlegen. `djIds` ist das Lineup; `id` setzt nur das Seed-Script. */
export async function createEvent({
  id = null,
  name,
  location,
  city,
  date = null,
  dayLabel = null,
  time,
  entry = 0,
  x = null,
  y = null,
  djIds = [],
}) {
  return db.transaction(async () => {
    const { lastInsertId } = await db.run(
      `INSERT INTO events (id, name, location, city, date, day_label, time, entry, x, y)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, location, city, date, dayLabel, time, entry, x, y]
    );
    const eventId = id ?? lastInsertId;
    await replaceLineup(eventId, djIds);
    return getEvent(eventId);
  });
}

/** Felder eines Events teilweise aktualisieren; `djIds` ersetzt das Lineup. */
export async function updateEvent(id, fields) {
  const mapping = {
    name: "name",
    location: "location",
    city: "city",
    date: "date",
    dayLabel: "day_label",
    time: "time",
    entry: "entry",
    x: "x",
    y: "y",
  };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(mapping)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(fields[key]);
    }
  }

  return db.transaction(async () => {
    if (sets.length > 0) {
      params.push(id);
      await db.run(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`, params);
    }
    if (fields.djIds !== undefined) {
      await replaceLineup(id, fields.djIds);
    }
    return getEvent(id);
  });
}

/** Event löschen; Lineup-Einträge fallen per CASCADE mit. */
export async function deleteEvent(id) {
  const { changes } = await db.run("DELETE FROM events WHERE id = ?", [id]);
  return changes > 0;
}

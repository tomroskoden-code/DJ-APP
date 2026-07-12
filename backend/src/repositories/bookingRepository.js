/* =======================================================================
   REPOSITORY: bookings

   Kapselt sämtliche SQL-Zugriffe auf die Tabelle bookings.
   Zur besseren Lesbarkeit der API-Antworten werden DJ-Name und
   Anfragesteller-Name direkt mitgeladen (JOIN).
   ======================================================================= */

import * as db from "../db/index.js";

// SELECT-Basis: Buchung inkl. Namen von DJ und Anfragesteller
const BASE_SELECT = `
  SELECT b.*, d.name AS dj_name, u.name AS requester_name
    FROM bookings b
    JOIN djs   d ON d.id = b.dj_id
    LEFT JOIN users u ON u.id = b.user_id
`;

// Wandelt eine Datenbankzeile in das API-Format um (Feldnamen wie die
// Mock-Struktur bookingRequests im Prototyp: djId, requester, eventType, ...)
function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    djId: row.dj_id,
    djName: row.dj_name,
    userId: row.user_id,
    requester: row.requester_name,
    eventType: row.event_type,
    date: row.date,
    time: row.time,
    duration: row.duration,
    genre: row.genre,
    location: row.location,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * Buchungen abrufen. Optionale Filter:
 *   djId   – nur Anfragen an diesen DJ
 *   userId – nur Anfragen dieser:s Nutzer:in
 *   status – 'offen' | 'bestaetigt' | 'abgelehnt'
 */
export async function listBookings({ djId, userId, status } = {}) {
  const where = [];
  const params = [];

  if (djId !== undefined) {
    where.push("b.dj_id = ?");
    params.push(djId);
  }
  if (userId !== undefined) {
    where.push("b.user_id = ?");
    params.push(userId);
  }
  if (status !== undefined) {
    where.push("b.status = ?");
    params.push(status);
  }

  const sql = `${BASE_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY b.created_at DESC, b.id DESC`;
  const rows = await db.all(sql, params);
  return rows.map(rowToBooking);
}

/** Einzelne Buchung per ID laden (oder null). */
export async function getBooking(id) {
  const row = await db.get(`${BASE_SELECT} WHERE b.id = ?`, [id]);
  return rowToBooking(row);
}

/** Neue Buchungsanfrage anlegen (Status startet immer als 'offen'). */
export async function createBooking({
  id = null, // nur vom Seed-Script gesetzt
  djId,
  userId = null,
  eventType = "Sonstiges",
  date,
  time,
  duration = 4,
  genre = null,
  location = null,
  message = null,
  status = "offen",
  createdAt = null, // nur vom Seed-Script gesetzt
}) {
  const { lastInsertId } = await db.run(
    `INSERT INTO bookings
       (id, dj_id, user_id, event_type, date, time, duration, genre, location, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    [id, djId, userId, eventType, date, time, duration, genre, location, message, status, createdAt]
  );
  return getBooking(id ?? lastInsertId);
}

/** Status einer Buchung ändern (bestätigen/ablehnen/wieder öffnen). */
export async function updateStatus(id, status) {
  await db.run("UPDATE bookings SET status = ? WHERE id = ?", [status, id]);
  return getBooking(id);
}

/** Buchung löschen; zugehörige Nachrichten fallen per CASCADE mit. */
export async function deleteBooking(id) {
  const { changes } = await db.run("DELETE FROM bookings WHERE id = ?", [id]);
  return changes > 0;
}

/* =======================================================================
   REPOSITORY: messages

   Kapselt sämtliche SQL-Zugriffe auf die Tabelle messages
   (Chat-Nachrichten je Buchung, wie chatMessages im Prototyp).
   ======================================================================= */

import * as db from "../db/index.js";

// Wandelt eine Datenbankzeile in das API-Format um
function rowToMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    sender: row.sender, // 'user' oder 'dj' (Rolle, wie im Prototyp)
    text: row.text,
    createdAt: row.created_at,
  };
}

/** Chatverlauf einer Buchung, älteste Nachricht zuerst. */
export async function listByBooking(bookingId) {
  const rows = await db.all(
    "SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at, id",
    [bookingId]
  );
  return rows.map(rowToMessage);
}

/** Einzelne Nachricht per ID laden (oder null). */
export async function getMessage(id) {
  const row = await db.get("SELECT * FROM messages WHERE id = ?", [id]);
  return rowToMessage(row);
}

/** Nachricht senden. `createdAt` wird nur vom Seed-Script gesetzt. */
export async function createMessage({ bookingId, sender, text, createdAt = null }) {
  const { lastInsertId } = await db.run(
    `INSERT INTO messages (booking_id, sender, text, created_at)
     VALUES (?, ?, ?, COALESCE(?, datetime('now')))`,
    [bookingId, sender, text, createdAt]
  );
  return getMessage(lastInsertId);
}

/** Nachricht löschen; liefert true, wenn ein Datensatz entfernt wurde. */
export async function deleteMessage(id) {
  const { changes } = await db.run("DELETE FROM messages WHERE id = ?", [id]);
  return changes > 0;
}

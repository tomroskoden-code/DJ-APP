/* =======================================================================
   REPOSITORY: ratings

   Kapselt sämtliche SQL-Zugriffe auf die Tabelle ratings.
   Nach jedem Anlegen/Löschen wird die Durchschnittsbewertung des DJs
   neu berechnet – wie recalcDjRating() im Prototyp.
   ======================================================================= */

import * as db from "../db/index.js";
import { recalcRating } from "./djRepository.js";

// SELECT-Basis: Bewertung inkl. Name des Verfassers
const BASE_SELECT = `
  SELECT r.*, u.name AS author_name
    FROM ratings r
    LEFT JOIN users u ON u.id = r.user_id
`;

// Wandelt eine Datenbankzeile in das API-Format um (Feldnamen wie die
// Mock-Struktur djs[].reviews im Prototyp: name, stars, comment, date)
function rowToRating(row) {
  if (!row) return null;
  return {
    id: row.id,
    djId: row.dj_id,
    userId: row.user_id,
    name: row.author_name ?? "Anonym", // Verfasser gelöscht -> anonymisiert
    stars: row.stars,
    comment: row.comment,
    date: row.date,
    createdAt: row.created_at,
  };
}

/** Alle Bewertungen eines DJs, neueste zuerst. */
export async function listByDj(djId) {
  const rows = await db.all(
    `${BASE_SELECT} WHERE r.dj_id = ? ORDER BY r.date DESC, r.id DESC`,
    [djId]
  );
  return rows.map(rowToRating);
}

/** Einzelne Bewertung per ID laden (oder null). */
export async function getRating(id) {
  const row = await db.get(`${BASE_SELECT} WHERE r.id = ?`, [id]);
  return rowToRating(row);
}

/**
 * Bewertung abgeben und die Durchschnittsbewertung des DJs aktualisieren.
 * `date`/`recalc` weichen nur beim Seeden ab: das Seed-Script übernimmt die
 * Mock-Daten samt Original-Datum und behält den Mock-Durchschnitt bei.
 */
export async function createRating({ djId, userId = null, stars, comment = "", date = null, recalc = true }) {
  const { lastInsertId } = await db.run(
    `INSERT INTO ratings (dj_id, user_id, stars, comment, date)
     VALUES (?, ?, ?, ?, COALESCE(?, date('now')))`,
    [djId, userId, stars, comment, date]
  );
  if (recalc) await recalcRating(djId);
  return getRating(lastInsertId);
}

/** Bewertung löschen und die Durchschnittsbewertung des DJs aktualisieren. */
export async function deleteRating(id) {
  const rating = await getRating(id);
  if (!rating) return false;

  await db.run("DELETE FROM ratings WHERE id = ?", [id]);
  await recalcRating(rating.djId);
  return true;
}

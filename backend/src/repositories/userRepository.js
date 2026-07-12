/* =======================================================================
   REPOSITORY: users

   Kapselt sämtliche SQL-Zugriffe auf die Tabelle users. Routen und
   Seed-Script kennen nur diese Funktionen – nie die Datenbank direkt.
   ======================================================================= */

import * as db from "../db/index.js";

// Wandelt eine Datenbankzeile in das API-Format (camelCase) um
function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    bio: row.bio,
    avatarColor: row.avatar_color,
    avatarEmoji: row.avatar_emoji,
    createdAt: row.created_at,
  };
}

/** Alle Nutzer:innen, alphabetisch sortiert. */
export async function listUsers() {
  const rows = await db.all("SELECT * FROM users ORDER BY name");
  return rows.map(rowToUser);
}

/** Einzelne:n Nutzer:in per ID laden (oder null). */
export async function getUser(id) {
  const row = await db.get("SELECT * FROM users WHERE id = ?", [id]);
  return rowToUser(row);
}

/** Neue:n Nutzer:in anlegen. */
export async function createUser({ name, bio = "", avatarColor = null, avatarEmoji = null }) {
  const { lastInsertId } = await db.run(
    "INSERT INTO users (name, bio, avatar_color, avatar_emoji) VALUES (?, ?, ?, ?)",
    [name, bio, avatarColor, avatarEmoji]
  );
  return getUser(lastInsertId);
}

/**
 * Nutzer:in anhand des (eindeutigen) Namens finden oder neu anlegen.
 * Wird vom Seed-Script und beim Anlegen von Buchungen/Bewertungen genutzt,
 * wenn nur ein Anzeigename statt einer userId übergeben wird.
 */
export async function findOrCreateByName(name, extras = {}) {
  const row = await db.get("SELECT * FROM users WHERE name = ?", [name]);
  if (row) return rowToUser(row);
  return createUser({ name, ...extras });
}

/** Felder einer:s Nutzer:in teilweise aktualisieren. */
export async function updateUser(id, fields) {
  // Erlaubte Felder auf Datenbankspalten abbilden
  const mapping = {
    name: "name",
    bio: "bio",
    avatarColor: "avatar_color",
    avatarEmoji: "avatar_emoji",
  };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(mapping)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return getUser(id);

  params.push(id);
  await db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
  return getUser(id);
}

/** Nutzer:in löschen; liefert true, wenn ein Datensatz entfernt wurde. */
export async function deleteUser(id) {
  const { changes } = await db.run("DELETE FROM users WHERE id = ?", [id]);
  return changes > 0;
}

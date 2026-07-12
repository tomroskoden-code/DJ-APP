/* =======================================================================
   REPOSITORY: djs

   Kapselt sämtliche SQL-Zugriffe auf die Tabelle djs.
   Die JSON-Spalten (genres, blockedDates, mixes) werden hier zentral
   serialisiert/geparst – nach außen sind es normale Arrays.
   ======================================================================= */

import * as db from "../db/index.js";

// Wandelt eine Datenbankzeile in das API-Format um (entspricht der
// Mock-Struktur in dj-app-prototype.html, damit der Prototyp die
// Antworten später direkt übernehmen kann).
function rowToDj(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    genre: row.genre,
    genres: JSON.parse(row.genres),
    price: row.price,
    rating: row.rating,
    city: row.city,
    color: row.color,
    available: row.available === 1,
    isPro: row.is_pro === 1,
    sponsored: row.sponsored === 1,
    blockedDates: JSON.parse(row.blocked_dates),
    avatarEmoji: row.avatar_emoji,
    bio: row.bio,
    followers: row.followers,
    mixes: JSON.parse(row.mixes),
    createdAt: row.created_at,
  };
}

/**
 * DJs suchen. Alle Filter sind optional:
 *   q         – Namenssuche (enthält, Groß-/Kleinschreibung egal)
 *   city      – exakte Stadt
 *   genres    – Array von Genres; ein DJ passt, wenn er mindestens eines bedient
 *   maxPrice  – maximaler Stundenpreis
 *   minRating – Mindestbewertung
 *   available – nur (nicht) verfügbare DJs
 */
export async function searchDjs({ q, city, genres, maxPrice, minRating, available } = {}) {
  // Einfache Filter direkt in SQL (portabel zwischen SQLite und PostgreSQL)
  const where = [];
  const params = [];

  if (q) {
    where.push("LOWER(name) LIKE ?");
    params.push(`%${q.toLowerCase()}%`);
  }
  if (city) {
    where.push("city = ?");
    params.push(city);
  }
  if (maxPrice !== undefined) {
    where.push("price <= ?");
    params.push(maxPrice);
  }
  if (minRating !== undefined) {
    where.push("rating >= ?");
    params.push(minRating);
  }
  if (available !== undefined) {
    where.push("available = ?");
    params.push(available ? 1 : 0);
  }

  const sql = `SELECT * FROM djs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name`;
  let djs = (await db.all(sql, params)).map(rowToDj);

  // Genre-Filter nach dem Parsen der JSON-Spalte in JavaScript anwenden –
  // das bleibt unabhängig vom JSON-Dialekt der jeweiligen Datenbank.
  if (genres && genres.length > 0) {
    const wanted = genres.map((g) => g.toLowerCase());
    djs = djs.filter((dj) =>
      dj.genres.some((g) => wanted.includes(g.toLowerCase())) ||
      wanted.includes(dj.genre.toLowerCase())
    );
  }

  return djs;
}

/** Einzelnen DJ per ID laden (oder null). */
export async function getDj(id) {
  const row = await db.get("SELECT * FROM djs WHERE id = ?", [id]);
  return rowToDj(row);
}

/** Neuen DJ anlegen. `id` ist optional und wird nur vom Seed-Script gesetzt. */
export async function createDj({
  id = null,
  name,
  genre,
  genres = [],
  price,
  rating = 0,
  city,
  color = null,
  available = true,
  isPro = false,
  sponsored = false,
  blockedDates = [],
  avatarEmoji = null,
  bio = "",
  followers = 0,
  mixes = [],
}) {
  const { lastInsertId } = await db.run(
    `INSERT INTO djs
       (id, name, genre, genres, price, rating, city, color, available,
        is_pro, sponsored, blocked_dates, avatar_emoji, bio, followers, mixes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      genre,
      JSON.stringify(genres),
      price,
      rating,
      city,
      color,
      available ? 1 : 0,
      isPro ? 1 : 0,
      sponsored ? 1 : 0,
      JSON.stringify(blockedDates),
      avatarEmoji,
      bio,
      followers,
      JSON.stringify(mixes),
    ]
  );
  return getDj(id ?? lastInsertId);
}

/** Felder eines DJs teilweise aktualisieren. */
export async function updateDj(id, fields) {
  // Erlaubte Felder auf Spalten abbilden; JSON-Felder werden serialisiert,
  // Boolean-Felder in 0/1 umgewandelt.
  const mapping = {
    name: { column: "name" },
    genre: { column: "genre" },
    genres: { column: "genres", toDb: JSON.stringify },
    price: { column: "price" },
    city: { column: "city" },
    color: { column: "color" },
    available: { column: "available", toDb: (v) => (v ? 1 : 0) },
    isPro: { column: "is_pro", toDb: (v) => (v ? 1 : 0) },
    sponsored: { column: "sponsored", toDb: (v) => (v ? 1 : 0) },
    blockedDates: { column: "blocked_dates", toDb: JSON.stringify },
    avatarEmoji: { column: "avatar_emoji" },
    bio: { column: "bio" },
    followers: { column: "followers" },
    mixes: { column: "mixes", toDb: JSON.stringify },
  };
  const sets = [];
  const params = [];
  for (const [key, { column, toDb }] of Object.entries(mapping)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(toDb ? toDb(fields[key]) : fields[key]);
    }
  }
  if (sets.length === 0) return getDj(id);

  params.push(id);
  await db.run(`UPDATE djs SET ${sets.join(", ")} WHERE id = ?`, params);
  return getDj(id);
}

/** DJ löschen; Buchungen, Bewertungen und Lineup-Einträge fallen per CASCADE mit. */
export async function deleteDj(id) {
  const { changes } = await db.run("DELETE FROM djs WHERE id = ?", [id]);
  return changes > 0;
}

/**
 * Durchschnittsbewertung eines DJs aus der ratings-Tabelle neu berechnen
 * (auf eine Nachkommastelle gerundet – wie recalcDjRating im Prototyp).
 */
export async function recalcRating(djId) {
  await db.run(
    `UPDATE djs
        SET rating = COALESCE(
          (SELECT ROUND(AVG(stars), 1) FROM ratings WHERE dj_id = ?), 0)
      WHERE id = ?`,
    [djId, djId]
  );
}

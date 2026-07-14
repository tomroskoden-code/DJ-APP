/* =======================================================================
   REPOSITORY: posts

   Kapselt sämtliche SQL-Zugriffe auf die Tabelle posts
   (Feed-Beiträge der DJs, wie feedPosts im Prototyp).
   ======================================================================= */

import * as db from "../db/index.js";

// Wandelt eine Datenbankzeile in das API-Format um (Feldnamen wie die
// Mock-Struktur feedPosts im Prototyp: djId, text, likes, liked)
function rowToPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    djId: row.dj_id,
    text: row.text,
    likes: row.likes,
    liked: row.liked === 1,
    createdAt: row.created_at,
  };
}

/** Feed-Beiträge abrufen, neueste zuerst. Optionaler Filter: djId. */
export async function listPosts({ djId } = {}) {
  const where = djId === undefined ? "" : "WHERE dj_id = ?";
  const rows = await db.all(
    `SELECT * FROM posts ${where} ORDER BY created_at DESC, id DESC`,
    djId === undefined ? [] : [djId]
  );
  return rows.map(rowToPost);
}

/** Einzelnen Beitrag per ID laden (oder null). */
export async function getPost(id) {
  const row = await db.get("SELECT * FROM posts WHERE id = ?", [id]);
  return rowToPost(row);
}

/** Neuen Beitrag anlegen. `likes`/`liked`/`createdAt` setzt nur das Seed-Script. */
export async function createPost({ djId, text, likes = 0, liked = false, createdAt = null }) {
  const { lastInsertId } = await db.run(
    `INSERT INTO posts (dj_id, text, likes, liked, created_at)
     VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    [djId, text, likes, liked ? 1 : 0, createdAt]
  );
  return getPost(lastInsertId);
}

/**
 * Beitrag teilweise aktualisieren. Ein geänderter Like-Zustand (`liked`)
 * passt die Like-Anzahl automatisch an – wie toggleLike() im Prototyp.
 */
export async function updatePost(id, fields) {
  const post = await getPost(id);
  if (!post) return null;

  const sets = [];
  const params = [];
  if (fields.text !== undefined) {
    sets.push("text = ?");
    params.push(fields.text);
  }
  if (fields.liked !== undefined) {
    const liked = fields.liked === true;
    if (liked !== post.liked) {
      sets.push("liked = ?", "likes = MAX(0, likes + ?)");
      params.push(liked ? 1 : 0, liked ? 1 : -1);
    }
  }
  if (sets.length === 0) return post;

  params.push(id);
  await db.run(`UPDATE posts SET ${sets.join(", ")} WHERE id = ?`, params);
  return getPost(id);
}

/** Beitrag löschen; liefert true, wenn ein Datensatz entfernt wurde. */
export async function deletePost(id) {
  const { changes } = await db.run("DELETE FROM posts WHERE id = ?", [id]);
  return changes > 0;
}

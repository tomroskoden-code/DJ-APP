/* =======================================================================
   ROUTEN: /api/posts

   GET    /api/posts       Feed-Beiträge abrufen (Filter: djId), neueste zuerst
   GET    /api/posts/:id   Einzelnen Beitrag abrufen
   POST   /api/posts       Beitrag veröffentlichen ({ djId, text })
   PATCH  /api/posts/:id   Beitrag aktualisieren; { "liked": true|false }
                           passt die Like-Anzahl automatisch an
   DELETE /api/posts/:id   Beitrag löschen
   ======================================================================= */

import { Router } from "express";
import * as postRepo from "../repositories/postRepository.js";
import * as djRepo from "../repositories/djRepository.js";
import { httpError } from "../httpError.js";
import { parseId, requireField } from "../validation.js";

const router = Router();

// Feed-Beiträge abrufen. Beispiel: GET /api/posts?djId=1
router.get("/", async (req, res) => {
  const { djId } = req.query;
  res.json(
    await postRepo.listPosts({
      djId: djId === undefined ? undefined : parseId(djId, "djId"),
    })
  );
});

// Einzelnen Beitrag abrufen
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const post = await postRepo.getPost(id);
  if (!post) throw httpError(404, "Beitrag nicht gefunden");
  res.json(post);
});

// Beitrag veröffentlichen. Beispiel-Body: { "djId": 1, "text": "Neues Set ist live!" }
router.post("/", async (req, res) => {
  const djId = parseId(requireField(req.body, "djId"), "djId");
  if (!(await djRepo.getDj(djId))) throw httpError(404, "DJ nicht gefunden");

  const text = String(requireField(req.body, "text")).trim();
  if (text === "") throw httpError(400, "text darf nicht leer sein");

  const post = await postRepo.createPost({ djId, text });
  res.status(201).json(post);
});

// Beitrag aktualisieren, z.B. Like-Zustand: { "liked": true }
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await postRepo.getPost(id))) throw httpError(404, "Beitrag nicht gefunden");

  if (req.body.liked !== undefined && typeof req.body.liked !== "boolean") {
    throw httpError(400, "liked muss ein Boolean sein");
  }
  if (req.body.text !== undefined && String(req.body.text).trim() === "") {
    throw httpError(400, "text darf nicht leer sein");
  }
  res.json(await postRepo.updatePost(id, req.body));
});

// Beitrag löschen
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await postRepo.deletePost(id);
  if (!deleted) throw httpError(404, "Beitrag nicht gefunden");
  res.status(204).end();
});

export default router;

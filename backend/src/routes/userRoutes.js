/* =======================================================================
   ROUTEN: /api/users

   GET    /api/users       Alle Nutzer:innen abrufen
   GET    /api/users/:id   Einzelne:n Nutzer:in abrufen
   POST   /api/users       Nutzer:in anlegen
   PATCH  /api/users/:id   Nutzer:in teilweise aktualisieren
   DELETE /api/users/:id   Nutzer:in löschen
   ======================================================================= */

import { Router } from "express";
import * as userRepo from "../repositories/userRepository.js";
import { httpError } from "../httpError.js";
import { parseId, requireField } from "../validation.js";

const router = Router();

router.get("/", async (req, res) => {
  res.json(await userRepo.listUsers());
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const user = await userRepo.getUser(id);
  if (!user) throw httpError(404, "Nutzer:in nicht gefunden");
  res.json(user);
});

// Beispiel-Body: { "name": "Alex", "bio": "", "avatarColor": "...", "avatarEmoji": "🎧" }
router.post("/", async (req, res) => {
  const name = String(requireField(req.body, "name")).trim();

  // Namen sind eindeutig – Duplikate mit verständlicher Meldung ablehnen
  const users = await userRepo.listUsers();
  if (users.some((u) => u.name === name)) {
    throw httpError(409, `Es existiert bereits ein:e Nutzer:in mit dem Namen "${name}"`);
  }

  const user = await userRepo.createUser({
    name,
    bio: req.body.bio ?? "",
    avatarColor: req.body.avatarColor ?? null,
    avatarEmoji: req.body.avatarEmoji ?? null,
  });
  res.status(201).json(user);
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await userRepo.getUser(id))) throw httpError(404, "Nutzer:in nicht gefunden");

  res.json(await userRepo.updateUser(id, req.body));
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await userRepo.deleteUser(id);
  if (!deleted) throw httpError(404, "Nutzer:in nicht gefunden");
  res.status(204).end();
});

export default router;

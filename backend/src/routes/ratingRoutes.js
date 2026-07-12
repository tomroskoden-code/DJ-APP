/* =======================================================================
   ROUTEN: Bewertungen

   Unter dem DJ aufgehängt (djRatingsRouter, mergeParams):
     GET  /api/djs/:djId/ratings   Bewertungen eines DJs abrufen
     POST /api/djs/:djId/ratings   Bewertung abgeben

   Direkt erreichbar (ratingsRouter):
     GET    /api/ratings/:id       Einzelne Bewertung abrufen
     DELETE /api/ratings/:id       Bewertung löschen
   ======================================================================= */

import { Router } from "express";
import * as ratingRepo from "../repositories/ratingRepository.js";
import * as djRepo from "../repositories/djRepository.js";
import * as userRepo from "../repositories/userRepository.js";
import { httpError } from "../httpError.js";
import { parseId, requireField } from "../validation.js";

// ---- Router für /api/djs/:djId/ratings --------------------------------
// mergeParams, damit :djId aus dem übergeordneten Pfad verfügbar ist
export const djRatingsRouter = Router({ mergeParams: true });

// Alle Bewertungen eines DJs, neueste zuerst
djRatingsRouter.get("/", async (req, res) => {
  const djId = parseId(req.params.djId, "djId");
  if (!(await djRepo.getDj(djId))) throw httpError(404, "DJ nicht gefunden");

  res.json(await ratingRepo.listByDj(djId));
});

// Bewertung abgeben. Der Verfasser wird entweder über userId referenziert
// oder über authorName (Nutzer:in wird dann bei Bedarf angelegt).
// Beispiel-Body: { "stars": 5, "comment": "Super!", "authorName": "Du" }
djRatingsRouter.post("/", async (req, res) => {
  const djId = parseId(req.params.djId, "djId");
  const dj = await djRepo.getDj(djId);
  if (!dj) throw httpError(404, "DJ nicht gefunden");

  const stars = Number(requireField(req.body, "stars"));
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw httpError(400, "stars muss eine ganze Zahl zwischen 1 und 5 sein");
  }

  // Verfasser ermitteln: userId hat Vorrang, sonst authorName (find or create)
  let userId = null;
  if (req.body.userId !== undefined) {
    userId = parseId(req.body.userId, "userId");
    if (!(await userRepo.getUser(userId))) throw httpError(404, "Nutzer:in nicht gefunden");
  } else if (typeof req.body.authorName === "string" && req.body.authorName.trim() !== "") {
    userId = (await userRepo.findOrCreateByName(req.body.authorName.trim())).id;
  } else {
    throw httpError(400, "Es muss userId oder authorName angegeben werden");
  }

  const rating = await ratingRepo.createRating({
    djId,
    userId,
    stars,
    comment: typeof req.body.comment === "string" ? req.body.comment.trim() : "",
  });

  // Die neu berechnete Durchschnittsbewertung gleich mitliefern
  const { rating: djRating } = await djRepo.getDj(djId);
  res.status(201).json({ ...rating, djRating });
});

// ---- Router für /api/ratings -------------------------------------------
export const ratingsRouter = Router();

// Einzelne Bewertung abrufen
ratingsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const rating = await ratingRepo.getRating(id);
  if (!rating) throw httpError(404, "Bewertung nicht gefunden");
  res.json(rating);
});

// Bewertung löschen (Durchschnitt des DJs wird neu berechnet)
ratingsRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await ratingRepo.deleteRating(id);
  if (!deleted) throw httpError(404, "Bewertung nicht gefunden");
  res.status(204).end();
});

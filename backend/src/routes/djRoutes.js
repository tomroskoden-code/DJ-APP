/* =======================================================================
   ROUTEN: /api/djs

   GET    /api/djs        DJs suchen (Filter: q, city, genre, maxPrice,
                          minRating, available)
   GET    /api/djs/:id    DJ-Detail inkl. Bewertungen (reviews)
   POST   /api/djs        DJ anlegen
   PATCH  /api/djs/:id    DJ teilweise aktualisieren
   DELETE /api/djs/:id    DJ löschen
   ======================================================================= */

import { Router } from "express";
import * as djRepo from "../repositories/djRepository.js";
import * as ratingRepo from "../repositories/ratingRepository.js";
import { httpError } from "../httpError.js";
import { parseId, requireField, parseBool } from "../validation.js";

const router = Router();

// DJs suchen. Beispiel:
//   GET /api/djs?city=Berlin&genre=Techno&maxPrice=130&minRating=4.5&available=true&q=nova
// "genre" darf mehrfach vorkommen (?genre=Techno&genre=House) – ein DJ passt,
// wenn er mindestens eines der gewünschten Genres bedient.
router.get("/", async (req, res) => {
  const { q, city, genre, maxPrice, minRating, available } = req.query;

  const genres = genre === undefined ? undefined : [].concat(genre);
  const djs = await djRepo.searchDjs({
    q,
    city,
    genres,
    maxPrice: maxPrice === undefined ? undefined : Number(maxPrice),
    minRating: minRating === undefined ? undefined : Number(minRating),
    available: parseBool(available),
  });
  res.json(djs);
});

// DJ-Detail inkl. eingebetteter Bewertungen (entspricht djs[].reviews im Prototyp)
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const dj = await djRepo.getDj(id);
  if (!dj) throw httpError(404, "DJ nicht gefunden");

  dj.reviews = await ratingRepo.listByDj(id);
  res.json(dj);
});

// Neuen DJ anlegen
router.post("/", async (req, res) => {
  requireField(req.body, "name");
  requireField(req.body, "genre");
  requireField(req.body, "city");
  const price = Number(requireField(req.body, "price"));
  if (!(price >= 0)) throw httpError(400, "price muss eine Zahl >= 0 sein");

  const dj = await djRepo.createDj({ ...req.body, id: null, price });
  res.status(201).json(dj);
});

// DJ teilweise aktualisieren (nur übergebene Felder werden geändert)
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await djRepo.getDj(id))) throw httpError(404, "DJ nicht gefunden");

  const dj = await djRepo.updateDj(id, req.body);
  res.json(dj);
});

// DJ löschen (Buchungen/Bewertungen/Lineups werden mitgelöscht)
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await djRepo.deleteDj(id);
  if (!deleted) throw httpError(404, "DJ nicht gefunden");
  res.status(204).end();
});

export default router;

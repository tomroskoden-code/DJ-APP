/* =======================================================================
   ROUTEN: /api/events

   GET    /api/events       Events abrufen (Filter: city)
   GET    /api/events/:id   Einzelnes Event abrufen
   POST   /api/events       Event anlegen
   PATCH  /api/events/:id   Event teilweise aktualisieren
   DELETE /api/events/:id   Event löschen

   Das Lineup wird als "lineup" (Array aus DJ-IDs oder DJ-Namen)
   entgegengenommen und in den Antworten als DJ-Namen (lineup) plus
   DJ-IDs (lineupIds) ausgegeben – wie die Mock-Struktur im Prototyp.
   ======================================================================= */

import { Router } from "express";
import * as eventRepo from "../repositories/eventRepository.js";
import * as djRepo from "../repositories/djRepository.js";
import { httpError } from "../httpError.js";
import { parseId, requireField } from "../validation.js";

const router = Router();

// Übersetzt ein gemischtes Lineup-Array (DJ-IDs oder DJ-Namen) in DJ-IDs
async function resolveLineup(lineup) {
  if (!Array.isArray(lineup)) {
    throw httpError(400, "lineup muss ein Array aus DJ-IDs oder DJ-Namen sein");
  }
  const djs = await djRepo.searchDjs();
  return lineup.map((entry) => {
    const dj =
      typeof entry === "number"
        ? djs.find((d) => d.id === entry)
        : djs.find((d) => d.name === entry);
    if (!dj) throw httpError(400, `DJ im Lineup nicht gefunden: ${entry}`);
    return dj.id;
  });
}

// Events abrufen. Beispiel: GET /api/events?city=Berlin
router.get("/", async (req, res) => {
  res.json(await eventRepo.listEvents({ city: req.query.city }));
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const event = await eventRepo.getEvent(id);
  if (!event) throw httpError(404, "Event nicht gefunden");
  res.json(event);
});

// Event anlegen. Beispiel-Body:
//   { "name": "Neon Nights", "location": "Warehouse 9", "city": "Berlin",
//     "dayLabel": "Heute", "time": "23:00", "entry": 15,
//     "lineup": ["DJ Nova", "Nightshade"], "x": 25, "y": 38 }
// city ist optional: Bei spontanen Events des Prototyps steckt die Stadt
// bereits im Freitext-Ort, dann bleibt city leer.
router.post("/", async (req, res) => {
  requireField(req.body, "name");
  requireField(req.body, "location");
  requireField(req.body, "time");

  const djIds = req.body.lineup === undefined ? [] : await resolveLineup(req.body.lineup);
  const event = await eventRepo.createEvent({
    name: req.body.name,
    location: req.body.location,
    city: req.body.city ?? "",
    date: req.body.date ?? null,
    dayLabel: req.body.dayLabel ?? null,
    time: req.body.time,
    entry: req.body.entry === undefined ? 0 : Number(req.body.entry),
    x: req.body.x ?? null,
    y: req.body.y ?? null,
    description: req.body.description ?? "",
    spontaneous: req.body.spontaneous === true,
    djIds,
  });
  res.status(201).json(event);
});

// Event teilweise aktualisieren; ein übergebenes "lineup" ersetzt das bisherige
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await eventRepo.getEvent(id))) throw httpError(404, "Event nicht gefunden");

  const fields = { ...req.body };
  if (fields.lineup !== undefined) {
    fields.djIds = await resolveLineup(fields.lineup);
    delete fields.lineup;
  }
  res.json(await eventRepo.updateEvent(id, fields));
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await eventRepo.deleteEvent(id);
  if (!deleted) throw httpError(404, "Event nicht gefunden");
  res.status(204).end();
});

export default router;

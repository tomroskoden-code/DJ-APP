/* =======================================================================
   ROUTEN: /api/bookings

   GET    /api/bookings       Buchungen abrufen (Filter: djId, userId, status)
   GET    /api/bookings/:id   Einzelne Buchung abrufen
   POST   /api/bookings       Buchungsanfrage erstellen
   PATCH  /api/bookings/:id   Status ändern (bestätigen/ablehnen)
   DELETE /api/bookings/:id   Buchung löschen

   Der Chat zu einer Buchung liegt unter /api/bookings/:bookingId/messages
   (siehe messageRoutes.js).
   ======================================================================= */

import { Router } from "express";
import * as bookingRepo from "../repositories/bookingRepository.js";
import * as djRepo from "../repositories/djRepository.js";
import * as userRepo from "../repositories/userRepository.js";
import { httpError } from "../httpError.js";
import { parseId, requireField } from "../validation.js";

const BOOKING_STATUSES = ["offen", "bestaetigt", "abgelehnt"];

const router = Router();

// Buchungen abrufen. Beispiel: GET /api/bookings?djId=1&status=offen
router.get("/", async (req, res) => {
  const { djId, userId, status } = req.query;

  if (status !== undefined && !BOOKING_STATUSES.includes(status)) {
    throw httpError(400, `Ungültiger status. Erlaubt: ${BOOKING_STATUSES.join(", ")}`);
  }
  const bookings = await bookingRepo.listBookings({
    djId: djId === undefined ? undefined : parseId(djId, "djId"),
    userId: userId === undefined ? undefined : parseId(userId, "userId"),
    status,
  });
  res.json(bookings);
});

// Einzelne Buchung abrufen
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const booking = await bookingRepo.getBooking(id);
  if (!booking) throw httpError(404, "Buchung nicht gefunden");
  res.json(booking);
});

// Buchungsanfrage erstellen. Der Anfragesteller wird über userId referenziert
// oder über requesterName (Nutzer:in wird dann bei Bedarf angelegt).
// Beispiel-Body:
//   { "djId": 1, "date": "2026-08-15", "time": "20:00", "duration": 4,
//     "eventType": "Geburtstag", "genre": "House", "location": "Berlin",
//     "message": "Bitte viel House!", "requesterName": "Du" }
router.post("/", async (req, res) => {
  const djId = parseId(requireField(req.body, "djId"), "djId");
  if (!(await djRepo.getDj(djId))) throw httpError(404, "DJ nicht gefunden");

  const date = requireField(req.body, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw httpError(400, "date muss ein ISO-Datum im Format YYYY-MM-DD sein");
  }
  const time = requireField(req.body, "time");
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw httpError(400, "time muss eine Uhrzeit im Format HH:MM sein");
  }

  const duration = req.body.duration === undefined ? 4 : Number(req.body.duration);
  if (!Number.isInteger(duration) || duration < 1 || duration > 24) {
    throw httpError(400, "duration muss eine ganze Zahl zwischen 1 und 24 sein");
  }

  // Anfragesteller ermitteln: userId hat Vorrang, sonst requesterName
  let userId = null;
  if (req.body.userId !== undefined) {
    userId = parseId(req.body.userId, "userId");
    if (!(await userRepo.getUser(userId))) throw httpError(404, "Nutzer:in nicht gefunden");
  } else if (typeof req.body.requesterName === "string" && req.body.requesterName.trim() !== "") {
    userId = (await userRepo.findOrCreateByName(req.body.requesterName.trim())).id;
  } else {
    throw httpError(400, "Es muss userId oder requesterName angegeben werden");
  }

  const booking = await bookingRepo.createBooking({
    djId,
    userId,
    eventType: req.body.eventType || "Sonstiges",
    date,
    time,
    duration,
    genre: req.body.genre ?? null,
    location: req.body.location ?? null,
    message: req.body.message ?? null,
  });
  res.status(201).json(booking);
});

// Status ändern, z.B. Body: { "status": "bestaetigt" }
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await bookingRepo.getBooking(id))) throw httpError(404, "Buchung nicht gefunden");

  const status = requireField(req.body, "status");
  if (!BOOKING_STATUSES.includes(status)) {
    throw httpError(400, `Ungültiger status. Erlaubt: ${BOOKING_STATUSES.join(", ")}`);
  }
  res.json(await bookingRepo.updateStatus(id, status));
});

// Buchung löschen (zugehörige Nachrichten werden mitgelöscht)
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await bookingRepo.deleteBooking(id);
  if (!deleted) throw httpError(404, "Buchung nicht gefunden");
  res.status(204).end();
});

export default router;

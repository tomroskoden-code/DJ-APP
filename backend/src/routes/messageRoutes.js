/* =======================================================================
   ROUTEN: Chat-Nachrichten

   Unter der Buchung aufgehängt (bookingMessagesRouter, mergeParams):
     GET  /api/bookings/:bookingId/messages   Chatverlauf abrufen
     POST /api/bookings/:bookingId/messages   Nachricht senden

   Direkt erreichbar (messagesRouter):
     DELETE /api/messages/:id                 Nachricht löschen
   ======================================================================= */

import { Router } from "express";
import * as messageRepo from "../repositories/messageRepository.js";
import * as bookingRepo from "../repositories/bookingRepository.js";
import { httpError } from "../httpError.js";
import { parseId, requireField } from "../validation.js";

// ---- Router für /api/bookings/:bookingId/messages ----------------------
export const bookingMessagesRouter = Router({ mergeParams: true });

// Chatverlauf einer Buchung, älteste Nachricht zuerst
bookingMessagesRouter.get("/", async (req, res) => {
  const bookingId = parseId(req.params.bookingId, "bookingId");
  if (!(await bookingRepo.getBooking(bookingId))) throw httpError(404, "Buchung nicht gefunden");

  res.json(await messageRepo.listByBooking(bookingId));
});

// Nachricht senden. sender ist wie im Prototyp die Rolle 'user' oder 'dj'.
// Beispiel-Body: { "sender": "user", "text": "Könnt ihr eine Nebelmaschine mitbringen?" }
bookingMessagesRouter.post("/", async (req, res) => {
  const bookingId = parseId(req.params.bookingId, "bookingId");
  if (!(await bookingRepo.getBooking(bookingId))) throw httpError(404, "Buchung nicht gefunden");

  const sender = requireField(req.body, "sender");
  if (!["user", "dj"].includes(sender)) {
    throw httpError(400, "sender muss 'user' oder 'dj' sein");
  }
  const text = String(requireField(req.body, "text")).trim();
  if (text === "") throw httpError(400, "text darf nicht leer sein");

  const message = await messageRepo.createMessage({ bookingId, sender, text });
  res.status(201).json(message);
});

// ---- Router für /api/messages -------------------------------------------
export const messagesRouter = Router();

// Nachricht löschen
messagesRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await messageRepo.deleteMessage(id);
  if (!deleted) throw httpError(404, "Nachricht nicht gefunden");
  res.status(204).end();
});

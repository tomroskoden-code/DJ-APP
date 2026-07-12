/* =======================================================================
   EXPRESS-APP für das BeatSpot-Backend

   Hier werden Middleware und alle Routen zusammengesteckt. Der eigentliche
   Server-Start (listen) liegt in server.js, damit die App z.B. in Tests
   ohne offenen Port verwendet werden kann.
   ======================================================================= */

import express from "express";
import cors from "cors";

import djRoutes from "./routes/djRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import { djRatingsRouter, ratingsRouter } from "./routes/ratingRoutes.js";
import { bookingMessagesRouter, messagesRouter } from "./routes/messageRoutes.js";

const app = express();

// CORS erlauben, damit der Prototyp (file:// oder anderer Port) die API
// später direkt aufrufen kann
app.use(cors());
// JSON-Bodies parsen
app.use(express.json());

// Kleiner Request-Logger für die lokale Entwicklung
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

// Health-Check, z.B. zum schnellen Prüfen, ob der Server läuft
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "BeatSpot-Backend" });
});

// Ressourcen-Routen
app.use("/api/djs", djRoutes);
app.use("/api/djs/:djId/ratings", djRatingsRouter);
app.use("/api/ratings", ratingsRouter);
app.use("/api/users", userRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/bookings/:bookingId/messages", bookingMessagesRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/events", eventRoutes);

// 404 für unbekannte API-Pfade
app.use((req, res) => {
  res.status(404).json({ error: "Endpunkt nicht gefunden" });
});

// Zentrale Fehlerbehandlung: httpError-Fehler bekommen ihren Statuscode,
// alles andere wird als 500 mit generischer Meldung ausgeliefert
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? "Interner Serverfehler" : err.message,
  });
});

export default app;

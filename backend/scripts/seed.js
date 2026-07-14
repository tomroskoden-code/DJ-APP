/* =======================================================================
   SEED-SCRIPT für das BeatSpot-Backend

   Liest die AKTUELLEN Mock-Daten direkt aus dj-app-prototype.html
   (Abschnitt "MOCK-DATEN" im <script>-Block) und trägt sie in die
   SQLite-Datenbank ein. Dadurch bleibt der Seed automatisch synchron
   mit dem Prototyp – die Daten sind nirgendwo doppelt gepflegt.

   ACHTUNG: Das Script setzt die Datenbank komplett zurück
   (alle Tabellen werden geleert und neu befüllt).

   Aufruf:  npm run seed
   ======================================================================= */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import * as db from "../src/db/index.js";
import * as djRepo from "../src/repositories/djRepository.js";
import * as userRepo from "../src/repositories/userRepository.js";
import * as bookingRepo from "../src/repositories/bookingRepository.js";
import * as messageRepo from "../src/repositories/messageRepository.js";
import * as ratingRepo from "../src/repositories/ratingRepository.js";
import * as eventRepo from "../src/repositories/eventRepository.js";
import * as postRepo from "../src/repositories/postRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_FILE = path.join(__dirname, "..", "..", "dj-app-prototype.html");

/* -----------------------------------------------------------------------
   1) Mock-Daten aus dem Prototyp extrahieren

   Der <script>-Block des Prototyps beginnt mit einem reinen Datenteil
   (Banner "MOCK-DATEN") und wechselt beim Banner "APPLIKATIONS-STATUS"
   in DOM-abhängigen Code. Wir werten nur den Datenteil in einer
   isolierten VM aus und lesen die benötigten Variablen aus.
   ----------------------------------------------------------------------- */
function extractMockData() {
  const html = fs.readFileSync(HTML_FILE, "utf8");

  // <script>-Block finden, der den Mock-Daten-Abschnitt enthält
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch || !scriptMatch[1].includes("MOCK-DATEN")) {
    throw new Error(
      `Kein <script>-Block mit "MOCK-DATEN" in ${HTML_FILE} gefunden. ` +
        "Wurde der Prototyp umstrukturiert? Dann bitte extractMockData() anpassen."
    );
  }
  const scriptCode = scriptMatch[1];

  // Datenteil endet am Banner-Kommentar "APPLIKATIONS-STATUS"
  const statusIndex = scriptCode.indexOf("APPLIKATIONS-STATUS");
  if (statusIndex === -1) {
    throw new Error(
      'Banner "APPLIKATIONS-STATUS" nicht gefunden – Ende des Datenteils unbekannt. ' +
        "Wurde der Prototyp umstrukturiert? Dann bitte extractMockData() anpassen."
    );
  }
  const bannerStart = scriptCode.lastIndexOf("/*", statusIndex);
  const dataCode = scriptCode.slice(0, bannerStart);

  // Datenteil isoliert ausführen; der angehängte Objekt-Ausdruck ist der
  // Rückgabewert von runInNewContext und liefert uns die Variablen
  const result = vm.runInNewContext(
    `${dataCode}\n;({ djs, events, bookingRequests, chatMessages, feedPosts });`,
    {},
    { timeout: 5000, filename: "dj-app-prototype.html (Mock-Daten)" }
  );

  for (const key of ["djs", "events", "bookingRequests", "feedPosts"]) {
    if (!Array.isArray(result[key]) || result[key].length === 0) {
      throw new Error(`Mock-Variable "${key}" konnte nicht extrahiert werden.`);
    }
  }
  if (typeof result.chatMessages !== "object" || result.chatMessages === null) {
    throw new Error('Mock-Variable "chatMessages" konnte nicht extrahiert werden.');
  }
  return result;
}

/* -----------------------------------------------------------------------
   2) Hilfsfunktionen
   ----------------------------------------------------------------------- */

// Formatiert ein Date als "YYYY-MM-DD HH:MM:SS" (Format von datetime('now'))
function toSqlDatetime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

// Übersetzt die Anzeige-Zeitstempel des Prototyps ("Gestern, 14:02",
// "gerade eben") in echte Zeitstempel; unbekannte Formate werden zu "jetzt"
function parseMockTime(label) {
  const yesterdayMatch = /^Gestern, (\d{2}):(\d{2})$/.exec(label ?? "");
  if (yesterdayMatch) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(Number(yesterdayMatch[1]), Number(yesterdayMatch[2]), 0, 0);
    return toSqlDatetime(date);
  }
  return toSqlDatetime(new Date());
}

// Übersetzt die relativen Feed-Zeitangaben des Prototyps ("vor 2 Std.",
// "vor 1 Tag") in echte Zeitstempel; unbekannte Formate werden zu "jetzt"
function parseMockRelativeTime(label) {
  const match = /^vor (\d+) (Min\.|Std\.|Tag)/.exec(label ?? "");
  if (!match) return toSqlDatetime(new Date());

  const amount = Number(match[1]);
  const minutes = { "Min.": 1, "Std.": 60, "Tag": 60 * 24 }[match[2]] * amount;
  return toSqlDatetime(new Date(Date.now() - minutes * 60 * 1000));
}

/* -----------------------------------------------------------------------
   3) Seeden
   ----------------------------------------------------------------------- */
async function seed() {
  const { djs, events, bookingRequests, chatMessages, feedPosts } = extractMockData();

  // Datenbank vollständig zurücksetzen (Reihenfolge wegen Fremdschlüsseln)
  await db.exec(`
    DROP TABLE IF EXISTS posts;
    DROP TABLE IF EXISTS event_lineup;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS ratings;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS djs;
    DROP TABLE IF EXISTS users;
  `);
  await db.initSchema();

  const counts = { djs: 0, users: 0, bookings: 0, messages: 0, ratings: 0, events: 0, posts: 0 };

  await db.transaction(async () => {
    // --- DJs (mit den Original-IDs des Prototyps) ------------------------
    // Hinweis: dj.rating wird als Startwert aus dem Mock übernommen. Sobald
    // über die API eine neue Bewertung eingeht, wird der Durchschnitt aus
    // der ratings-Tabelle neu berechnet – wie recalcDjRating() im Prototyp.
    for (const dj of djs) {
      await djRepo.createDj({
        id: dj.id,
        name: dj.name,
        genre: dj.genre,
        genres: dj.genres,
        price: dj.price,
        rating: dj.rating,
        city: dj.city,
        color: dj.color,
        available: dj.available,
        isPro: dj.isPro,
        sponsored: dj.sponsored,
        blockedDates: dj.blockedDates,
        avatarEmoji: dj.avatarEmoji,
        bio: dj.bio,
        followers: dj.followers,
        mixes: dj.mixes,
      });
      counts.djs++;
    }

    // --- Nutzer:innen -----------------------------------------------------
    // Der Prototyp hat keine eigene Nutzerliste. Wir legen daher an:
    //   1. die Demo-Persona "Du" (Anzeigename + Avatar aus dem Prototyp-State)
    //   2. alle Anfragesteller der Buchungen
    //   3. alle Verfasser der Bewertungen
    await userRepo.createUser({
      name: "Du",
      bio: "",
      avatarColor: "linear-gradient(135deg,#2ef2ff,#33e6a0)",
      avatarEmoji: "🙂",
    });

    // --- Bewertungen (aus djs[].reviews) ---------------------------------
    // recalc: false, damit der Mock-Durchschnitt der DJs erhalten bleibt
    // (die sichtbaren Mock-Reviews ergeben nicht exakt den Mock-Durchschnitt)
    for (const dj of djs) {
      for (const review of dj.reviews ?? []) {
        const author = await userRepo.findOrCreateByName(review.name);
        await ratingRepo.createRating({
          djId: dj.id,
          userId: author.id,
          stars: review.stars,
          comment: review.comment,
          date: review.date,
          recalc: false,
        });
        counts.ratings++;
      }
    }

    // --- Buchungsanfragen (mit den Original-IDs des Prototyps) -----------
    for (const request of bookingRequests) {
      const requester = await userRepo.findOrCreateByName(request.requester);
      await bookingRepo.createBooking({
        id: request.id,
        djId: request.djId,
        userId: requester.id,
        eventType: request.eventType,
        date: request.date,
        time: request.time,
        duration: request.duration,
        genre: request.genre,
        location: request.location,
        message: request.message,
        status: request.status,
      });
      counts.bookings++;
    }

    // --- Chat-Nachrichten (je Buchungs-ID) --------------------------------
    for (const [bookingId, messages] of Object.entries(chatMessages)) {
      for (const message of messages) {
        await messageRepo.createMessage({
          bookingId: Number(bookingId),
          sender: message.sender,
          text: message.text,
          createdAt: parseMockTime(message.time),
        });
        counts.messages++;
      }
    }

    // --- Events inkl. Lineup (mit den Original-IDs des Prototyps) --------
    // Die Lineup-Namen des Mocks werden auf DJ-IDs aufgelöst
    for (const event of events) {
      const djIds = (event.lineup ?? []).map((name) => {
        const dj = djs.find((d) => d.name === name);
        if (!dj) {
          throw new Error(`Lineup-DJ "${name}" von Event "${event.name}" nicht in den Mock-DJs gefunden.`);
        }
        return dj.id;
      });
      await eventRepo.createEvent({
        id: event.id,
        name: event.name,
        location: event.location,
        city: event.city,
        dayLabel: event.dayLabel,
        time: event.time,
        entry: event.entry,
        x: event.x,
        y: event.y,
        description: event.description ?? "",
        spontaneous: event.spontaneous === true,
        djIds,
      });
      counts.events++;
    }

    // --- Feed-Beiträge der DJs (relative Mock-Zeiten -> echte Zeitstempel) --
    for (const post of feedPosts) {
      await postRepo.createPost({
        djId: post.djId,
        text: post.text,
        likes: post.likes,
        liked: post.liked,
        createdAt: parseMockRelativeTime(post.time),
      });
      counts.posts++;
    }

    counts.users = (await userRepo.listUsers()).length;
  });

  console.log("Seed erfolgreich abgeschlossen:");
  console.log(`  DJs:         ${counts.djs}`);
  console.log(`  Nutzer:      ${counts.users}`);
  console.log(`  Buchungen:   ${counts.bookings}`);
  console.log(`  Nachrichten: ${counts.messages}`);
  console.log(`  Bewertungen: ${counts.ratings}`);
  console.log(`  Events:      ${counts.events}`);
  console.log(`  Feed-Posts:  ${counts.posts}`);
}

try {
  await seed();
} finally {
  await db.close();
}

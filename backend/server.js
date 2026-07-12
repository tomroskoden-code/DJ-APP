/* =======================================================================
   SERVER-START für das BeatSpot-Backend

   Stellt sicher, dass das Datenbankschema existiert, und startet dann
   den Express-Server. Port per Umgebungsvariable PORT übersteuerbar.

   Vor dem ersten Start einmal `npm run seed` ausführen, um die Mock-Daten
   aus dj-app-prototype.html in die Datenbank zu übernehmen.
   ======================================================================= */

import app from "./src/app.js";
import { initSchema } from "./src/db/index.js";

const PORT = Number(process.env.PORT) || 3000;

// Tabellen anlegen, falls noch nicht vorhanden (idempotent)
await initSchema();

app.listen(PORT, () => {
  console.log(`BeatSpot-Backend läuft auf http://localhost:${PORT}`);
  console.log(`Health-Check:            http://localhost:${PORT}/api/health`);
});

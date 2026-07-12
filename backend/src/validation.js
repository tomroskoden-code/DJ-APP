/* =======================================================================
   Kleine Validierungshelfer für die Routen.
   ======================================================================= */

import { httpError } from "./httpError.js";

/** Prüft, ob ein Pfad-/Query-Parameter eine positive Ganzzahl ist. */
export function parseId(value, name = "id") {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, `Ungültiger Wert für ${name}: ${value}`);
  }
  return id;
}

/** Prüft, dass ein Pflichtfeld vorhanden und kein leerer String ist. */
export function requireField(body, name) {
  const value = body[name];
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    throw httpError(400, `Pflichtfeld fehlt: ${name}`);
  }
  return value;
}

/** Interpretiert Query-Werte wie "true"/"1"/"false"/"0" als Boolean. */
export function parseBool(value) {
  if (value === undefined) return undefined;
  return value === "true" || value === "1";
}

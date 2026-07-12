/* =======================================================================
   Kleiner Helfer für HTTP-Fehler: erzeugt einen Error mit Statuscode,
   den die zentrale Fehler-Middleware in app.js als JSON ausliefert.
   ======================================================================= */

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

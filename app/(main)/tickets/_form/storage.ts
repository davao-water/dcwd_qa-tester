/** The last Device type chosen in this browser. */
export const DEVICE_KEY = "qa-hub:device-type";

/** Browser storage can be unavailable (private windows); a draft or remembered choice is only a convenience. */
export function storage(run: (s: Storage) => void) {
  try {
    run(localStorage);
  } catch {
    // Nothing to do: the form still works, it just won't remember.
  }
}

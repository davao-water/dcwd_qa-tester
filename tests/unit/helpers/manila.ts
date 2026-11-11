/** A UTC instant from a Manila wall-clock time (UTC+8). */
export const manila = (iso: string) => new Date(new Date(iso + "Z").getTime() - 8 * 3600_000);

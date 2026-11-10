/** "sign-up" or "sign-ups", by how many there are. */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Maria" from "Maria Santos". */
export const firstName = (name: string) => name.split(/\s+/)[0];

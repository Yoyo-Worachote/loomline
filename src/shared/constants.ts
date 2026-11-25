/** Values shared with the browser. Kept apart from the zod schemas, which only the server needs. */
export const AVATAR_COUNT = 8;
export const MAX_NAME = 20;
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const TURN_LIMITS = [0, 45, 90, 180] as const;

/** Accepts a typed code or a whole pasted invite link. */
export const codeFromInput = (s: string) => /#\/?room\/([A-Za-z0-9]+)/.exec(s)?.[1]?.toUpperCase() ?? s.toUpperCase();

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Package IDs only. Saved flags and sheet CSS retain the dark-heresy namespace. */
export const SUPPORTED_SYSTEM_IDS = Object.freeze(['apex-heresy-ru', 'dark-heresy']);
export const isSupportedSystem = (id = globalThis.game?.system?.id) => SUPPORTED_SYSTEM_IDS.includes(id);

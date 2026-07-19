export const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);

export const PROTEIN = /^[ACDEFGHIKLMNPQRSTVWY]+$/i;
export const isValidSequence = s => typeof s === 'string' && PROTEIN.test(s.replace(/\s+/g,''));

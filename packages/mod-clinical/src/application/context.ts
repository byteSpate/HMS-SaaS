// What clinical commands need besides the request scope (T-VIS-01): the clock, injectable so tests
// fix "now" (check-in happens on the session's hospital date).
export const CLINICAL_CLOCK = Symbol('CLINICAL_CLOCK');

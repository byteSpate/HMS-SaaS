// What pharmacy commands need besides the request scope (T-CLI-03): the clock, injectable so
// tests fix "now".
export const PHARMACY_CLOCK = Symbol('PHARMACY_CLOCK');

// What billing commands need besides the request scope (T-BIL-01): the clock, injectable so tests
// fix "now" for effective times. The scope itself comes from @hms/platform's requestScope().
export const BILLING_CLOCK = Symbol('BILLING_CLOCK');

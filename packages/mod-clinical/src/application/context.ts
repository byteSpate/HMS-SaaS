// What clinical commands need besides the request scope (T-VIS-01, T-CLI-01): the clock,
// injectable so tests fix "now" (check-in happens on the session's hospital date), and the
// hospital's time zone, which decides what "today" is for the doctor's worklist.
export const CLINICAL_CLOCK = Symbol('CLINICAL_CLOCK');

// C-024: one facility per hospital, every pilot hospital in Bangladesh (as scheduling assumes).
export const HOSPITAL_TIME_ZONE = 'Asia/Dhaka';

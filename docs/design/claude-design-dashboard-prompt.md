# Claude Design brief: role-based dashboard and shell redesign

Prepared 2026-11-10. Use with Claude Design (claude.ai/design) on the Fable model.
Part 1 is how to run the session. Part 2 is the prompt to paste. Part 3 has follow-up prompts.
Part 4 covers bringing the result back into the repo.

---

## Part 1: How to get the best output from Claude Design

### 1.1 Before you open Claude Design

1. **Take screenshots of the current app** (run `pnpm dev`, sign in to the demo hospital):
   - Home (`/`), the empty "nothing yet" card. This is the screen being replaced.
   - Front desk (`/patients`), a patient record, Schedules (`/schedules`), Users (`/admin/users`).
   - The same Home screen at phone (360 px) and tablet (768 px) width, and once in Bangla.
     Claude Design matches the existing look far better from pixels than from words.
2. **Take screenshots of the ICT Health reference.** The product screenshots on their site
   (the "Live Clinical Workflow Simulator" tabs, the EHR cockpit, nurse cockpit and PAS admin
   images on https://icthealth.com/ and /platform/hinai-web/) show what we want to learn from.
   I could not see those images, only their captions. Upload the images themselves.
3. **Attach these repo files** (drag them in, or link the GitHub repo if your Claude Design
   org allows it, so it can build a design system from the code):
   - `DESIGN.md` (our design system: the rules it must follow)
   - `packages/ui/src/styles/theme-light.css` and `tokens.css` (the real token values)
   - `packages/ui/src/layouts/AppShell.tsx` (the shell it is redesigning)
   - `apps/web/src/navigation.ts` (the real nav items and permission codes)
   - `docs/planning/docs/F-ui-ux-design.md` sections 1 and 2 (principles, roles, screen list)

### 1.2 How to run the session

- **Send the whole prompt (Part 2) as one message.** Fable handles long, detailed context well.
  A long first brief does better than many short corrections, because every later turn builds
  on what it understood first.
- **Have it ask questions and propose directions before it builds.** The prompt asks for 2 or 3
  direction sketches first. Pick one, then let it build the full screens. That costs less than
  repainting a finished design.
- **Change one thing per turn.** "Make the KPI row denser and move Last updated into the strip"
  works. "Make it better" does not.
- **Use inline comments on elements** (click the element, comment) for local fixes instead of
  describing the location in chat.
- **Use the tweak controls** (spacing, density, color) to explore, then tell it the final value
  in chat so it is written down, not just a slider position.
- **Check it in Bangla every round.** Ask "switch all copy to Bangla" before you accept any
  layout. Bangla text is about 30 percent longer and is where layouts break.
- **Keep fake data obviously fake.** "Demo General Hospital", invented names. DESIGN.md forbids
  real hospitals, customers or testimonials in demo content.
- **Turn the result into a spec before handoff.** The last prompt in Part 3 asks it to list
  every component, token and state it used, so Claude Code can map it onto `packages/ui`.

### 1.3 What to borrow from ICT Health and what to skip

Their page is a marketing site, not their product UI, so take patterns, not looks.

Borrow:

- **Live status strip** (their "LIVE CLINICIAN SESSION: Ward 4A, CPOE Ready" ribbons): a thin
  strip at the top of each role home showing current context and system state.
- **KPI triplet per module**: three key numbers with a label, each linking to its list.
- **Role-based entry points** (their "By Role" navigation): each role lands on its own home.
- **Department tabs**: one module switcher with its own KPI set per tab.
- **User-configurable layout** (their EHR lets physicians reorder panels): let users hide or
  reorder dashboard cards, saved per user.
- **One patient index across modules**: one patient banner and record, whatever the module.

Skip (these break DESIGN.md):

- Photographic heroes, stock imagery, marquee logo walls, animated counters.
- Emoji as icons. We have an in-house SVG icon set.
- Marketing CTAs ("Request a Demo") inside the staff app.
- Any color that competes with our status colors.

---

## Part 2: The prompt (copy everything between the lines)

---

You are designing the signed-in experience of a hospital ERP sold as multi-tenant SaaS to
hospitals and diagnostic centres in Bangladesh. I want a redesign of the **home dashboard**
(role-based), the **app shell** (sidebar, top bar), and a set of **UI/UX rule fixes**, all inside
our existing design system. This will be built later in Next.js 16 + React 19 + Tailwind 4 with
an in-house component library. Design production screens, not a marketing page.

Before you design anything:

1. Restate the brief in 5 to 8 bullets.
2. Ask me up to 5 questions where your answer would change the design.
3. Propose 2 or 3 visual directions as low-detail sketches of the Front desk home on desktop,
   each with one paragraph on its trade-offs. Wait for me to choose before full fidelity.

### A. Product context

- Users are hospital staff at busy desks: receptionists, cashiers, doctors, nurses, lab
  technologists, lab authorities, pharmacists, finance, hospital administrators, management.
  They use it 8+ hours a day, mostly on desktop with a keyboard, also on tablets on the wards
  and sometimes on phones.
- **Bilingual, Bangla first.** Every screen exists in Bangla and English. Bangla strings run
  about 30 percent longer and need more line height (1.6 for body). Design the layout in Bangla
  first and check it in English. Show both versions of the main screen.
- Each hospital is a tenant with its own name and logo in the shell. Use "Demo General
  Hospital" (Bangla: "ডেমো জেনারেল হাসপাতাল") with a placeholder logo. Never use real hospital
  names.
- Money is Bangladeshi taka (BDT, taka sign), with tabular figures. Patient IDs are MRNs, for
  example "MRN 2026-004817". Dates follow the hospital's locale; show times as 24-hour or
  12-hour as the locale says.

### B. Our design system (hard rules, do not change them)

Creative north star: **"The Quiet Front Desk"**. A good front desk never makes the patient wait
for the software. Calm, neutral surfaces, high-contrast text, a small color vocabulary, the next
action obvious. The data is the interface.

Colors (exact tokens):

- Page background `#f9fbfb`, data surfaces (cards, tables, inputs) `#ffffff`, hover fill
  `#f1f3f3`, decorative border `#e3e7e8`, input/outlined-button border `#67787c`.
- Text `#161b1d`, muted text `#4b585b`, headings `#022f2e`. No pure black.
- **Primary teal `#00786f`** (hover `#005f5a`, selected-row fill `#f0fdfa`, focus ring
  `#009689`). Teal means "you can act here" and nothing else: buttons, links, active nav,
  selection. Never a status.
- **Accent cyan `#007595`** (soft `#ecfeff`): only for the second chart series, the "New"
  marker and keyboard-shortcut chips. Never a button, link or status.
- **Six status colors by meaning** (soft fill / dark text): Idle `#f1f3f3`/`#22292b`, Active
  `#dbeafe`/`#193cb8`, Review `#f3e8ff`/`#6e11b0`, Attention `#fef3c6`/`#973c00`, Done
  `#dcfce7`/`#016630`, Problem `#ffe2e2`/`#9f0712`. Danger button red `#c10007`.
- Every status badge carries a word and an icon in the badge's text color. Color is never the
  only signal (screens print in black and white).
- Do not use orange, yellow, indigo, or any hue close to a status color for decoration.
- The tenant logo may contain red and green: keep it in the shell header only, never next to
  status badges.

Type:

- Headings: TikTok Sans (Latin) with Noto Sans Bengali (Bangla).
- Body: Geist with Tiro Bangla for Bangla reading text. UI labels, tables, buttons, badges:
  Geist with Noto Sans Bengali, medium weight. Money and MRN use tabular figures.
- Body 16 px. Worklists use a compact size one step smaller. No faux bold.

Shape, depth, rhythm:

- Radius 6 px on controls, 8 px on cards and panels, pill only for status badges. No pill
  buttons. 1 px borders.
- Flat and tonal: depth comes from white surfaces on the mist page plus borders. Shadows only on
  overlays (dialogs, menus, toasts), tinted teal-dark, never black.
- 4 px grid. Table rows 32 px compact, 40 px comfortable. Touch targets 44 px on tablet and phone.
- Motion confirms, never decorates: press `scale(0.97)` at 160 ms, overlays 150 to 200 ms
  ease-out from their trigger. Nothing animates on keyboard actions. No animated counters.
- Light theme only for now. (Dark tokens exist but are off.)

Layout tiers (built into the shell, screens never handle breakpoints themselves):

- Desktop 1280 px and up (design at 1366): 240 px sidebar, collapsible to a 72 px icon rail, plus
  a top bar. Content capped at about 1536 px, not stretched.
- Tablet 768 to 1279: 72 px icon rail plus the same top bar.
- Phone below 768 (design at 360): top bar plus a bottom tab bar with up to 5 items plus "More".
  Tables become stacked rows. Tasks unsafe on a phone show "Use a tablet or computer".

### C. What exists today (see the attached screenshots)

- Shell: sidebar with tenant logo and name, nav items filtered by the user's permissions, a top
  bar with only a language switch (Bangla | English) and a user menu.
- Nav today: Home, Patients (front desk search and registration), Schedules (doctor sessions),
  Practitioners, Departments, Users, Roles, Audit. Coming soon: Visits / check-in, Cashier desk,
  Doctor worklist and consultation, Lab worklists, Bed board, Ward list, Pharmacy, Reports.
- **Home is a placeholder**: a title, "Welcome, <name>", and one card saying the hospital name
  and "nothing here yet". It is the same for every role. This is the main thing to replace.

### D. What to design

**D1. Role-based home dashboards.** Home changes with the user's role (their permissions decide
what they see; a user with several roles sees a role switcher or merged sections). Design these,
in priority order:

1. **Receptionist: Front desk home.** One prominent patient search (focus with `/`, search by
   name, phone, MRN or NID) with four quick actions under it, each showing its keyboard shortcut
   as a cyan chip: New registration, Check in, Take payment, Print token. Below: today's arrivals
   (appointments by doctor session, with Booked / Arrived / In consultation / Done / No-show
   statuses), walk-ins waiting, and doctor sessions running now with queue length.
2. **Doctor: My worklist.** Today's sessions; the patient queue for the current session (token
   number, name, age/sex, visit type, waiting time, status); results waiting for review; next
   visits due.
3. **Management: Operational dashboard.** Today's registrations, visits by kind (OPD,
   diagnostic, emergency), collections by payment method (cash, card, mobile banking), pending
   lab stages (to collect, to receive, to enter, to verify, to release), bed status counts (when
   inpatient care is on). **Every number links to the list it summarizes.** Each data panel shows
   when its numbers were taken ("as of 14:05").
4. **Hospital administrator: Administration home.** Setup checklist for a new hospital
   (departments, practitioners, doctor sessions, price list, users and roles, print templates)
   with progress, plus recent sensitive actions from the audit log.

For each home use the same skeleton so all roles feel like one product:

- A **context strip** at the top (from the ICT Health "live session" ribbons): hospital,
  facility, today's date, the user's current desk or session, and a "Last updated hh:mm" with a
  refresh action. Calm, one line, not a banner.
- A **KPI row** of 3 to 4 tiles: label, number, small comparison (vs yesterday) as text, the
  whole tile is a link. No sparklines unless they add meaning.
- **Work panels** below: the lists the role acts on, with real table density, status badges and
  a primary action per row.
- Cards the user can **hide or reorder** (an "Edit layout" mode), saved per user.

**D2. App shell improvements.**

- Global search in the top bar (`/` to focus) that finds patients, and later other records,
  with a results panel grouped by type.
- Facility selector next to the hospital name when a hospital has more than one facility.
- Group the sidebar nav into sections (for example Front office, Clinical, Diagnostics,
  Inpatient, Finance, Administration). Show section headers on desktop, hide them in the rail.
- Sticky **patient banner** under the top bar in any patient context: name in both scripts,
  MRN, age/sex, phone, allergies or alerts flag, current visit. "Right patient, every time".
- Keyboard help overlay (`?`) listing shortcuts for the current screen.

**D3. Every state of every panel.** Loading (skeletons shaped like the content, no spinners on
whole pages), empty (says what goes here and the next action), error (plain words plus Retry),
"not set up for this hospital" (a feature the hospital has not configured; say so plainly, never
show a half-working control), no permission (the panel is not rendered at all), and the network
unsure state ("Not sure yet, checking", never shown as success or failure).

### E. UI/UX rules to apply and fix

1. One primary action per screen region. Secondary actions are white buttons with a border.
   Destructive actions are red and always confirmed.
2. Status always as badge = icon + word + soft color. Never a colored dot alone.
3. A screen says "Saved" only after the server confirms.
4. Things that are separate look separate: doctor-fee invoice and service invoice are two cards
   with two balances.
5. Full keyboard operation at the busy desks: visible focus ring, logical tab order, shortcuts
   shown beside the actions, Enter to open a row, Esc to close.
6. WCAG 2.2 AA: 4.5:1 text contrast, 3:1 for borders and focus, 44 px targets on touch.
7. Table headers wrap instead of truncating. Buttons never cut off a critical word in Bangla.
8. Numbers: tabular figures, right-aligned in tables, taka sign with thousands separators.
9. No toast for critical information. Use inline messages.
10. Text: short, plain words, sentence case. Write both English and Bangla copy.

### F. Deliverables

1. Front desk home at desktop 1366 (Bangla and English), tablet 768 and phone 360.
2. Doctor worklist home and Management dashboard at desktop, plus Management at tablet.
3. Administration home at desktop.
4. The shell: expanded sidebar, collapsed rail, grouped nav, top bar with global search open,
   facility selector, patient banner.
5. A state sheet: loading, empty, error, not set up, unsure, for one KPI tile and one work panel.
6. A component inventory page: every component you used, its variants and states, and the
   tokens behind it. Flag anything that is not in the design system above as "NEW", with why we
   need it.

Make it interactive where it helps review: nav items switch the home, the search opens its
panel, "Edit layout" shows the reorder mode, the language toggle switches all copy.

---

## Part 3: Follow-up prompts (one per turn)

Use after you have picked a direction and the first full screens exist.

1. "Switch all copy to Bangla. Check every button, table header and KPI label for truncation and
   fix the layout, not the words."
2. "Check every color pair on this screen against WCAG 2.2 AA and list any that fail with their
   ratio. Then fix them using only the given tokens."
3. "Audit this screen against the rules in section E of my brief. List each rule as pass or fail
   with the element, then fix the failures."
4. "Show this screen with a hospital that has 3 doctors and 40 patients a day, then with one that
   has 60 doctors and 2,000 a day. Adjust density and pagination so both work."
5. "Walk me through the keyboard path a receptionist takes to find a returning patient and check
   them in. Show the focus ring at each step."
6. "Remove anything decorative that does not help someone finish a task. Tell me what you
   removed."
7. "Show the Management dashboard when IPD is not enabled and when the lab module is not set up."
8. Before handoff: "Write a handoff spec: for each screen, the layout regions, the components
   with props and variants, every state, the tokens used, the keyboard shortcuts, and the copy in
   both languages. Mark every component that does not exist yet in our library as NEW."

---

## Part 4: Bringing it back into the repo

- Export the handoff to Claude Code (or download the HTML/spec) and save it under
  `docs/design/`. Implementation then goes into `packages/ui` (new primitives and patterns) and
  `apps/web` (screens), following the repo rules: tokens only, no color literals in `apps/web`,
  strings in `packages/i18n`, shell breakpoints only in `AppShell`.
- Anything marked NEW, or anything that changes DESIGN.md (for example dashboard chart styles,
  nav grouping), needs product-owner sign-off and an update to DESIGN.md and ADR-022 first.
- The Claude Design connector in this Claude Code session failed to sign in (HTTP 403). Run
  `/design-login` if you want me to pull the design straight from Claude Design later.

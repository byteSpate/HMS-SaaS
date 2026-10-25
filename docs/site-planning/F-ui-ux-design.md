# F — UI/UX design (public website)

| Control    | Value                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Document   | F UI/UX design for `apps/site`                                                 |
| Version    | 0.1.0-draft                                                                    |
| Status     | Proposal                                                                       |
| Owner role | UX lead + product owner                                                        |
| Updated    | 2026-10-21                                                                     |
| Applies    | [DESIGN.md](../../DESIGN.md) and ADR-022, with the public-site exception P-027 |

## 1. Design direction

**"The Welcoming Front Door."** The ERP is the quiet front desk; the website is the door patients walk through first. Same voice, warmer surface: generous white space, photography of people and places (P-027), the same teal that means "you can act here", and the same Bangla-first typography.

What carries over unchanged from DESIGN.md: tokens (Clinical Teal primary, Signal Cyan accent, Mist neutrals), fonts (TikTok Sans and Noto Sans Bengali headings, Geist and Tiro Bangla body), radius scale (6 / 8 px), motion grammar, focus ring, the One Meaning Rule, the Word Beside The Color Rule, no faux bold, Longer Bangla Rule, Logo Quarantine.

What is different on the site (P-027): photography and illustration are allowed; section backgrounds may use `primary-soft`, `accent-soft` and a deep `heading`-color band; display headline sizes are larger than in the ERP; cards may use the overlay shadow on hover only. The site also adds a motion layer on top of the motion grammar (C-083): arrival, scroll reveals, card lift, header shadow, FAQ height, booking steps and the emergency ring, all removed for reduced motion.

Layout reference: the structure of continental.health (C-064), as observed in R1 section 1. Nothing is copied.

## 2. Page inventory

| Route                                       | Page                         | Main components                                                                                                                     | Requirements         |
| ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `/`                                         | Home                         | Hero search, quick actions, department grid, centres, featured doctors, packages, branches, guide teaser, articles, emergency strip | FR-WEB-HOME-*        |
| `/doctors`                                  | Find a doctor                | Search, department and branch filters, result count, doctor cards                                                                   | FR-WEB-DOC-001..003  |
| `/doctors/[slug]`                           | Doctor profile               | Profile header, tabs (About, Education, Experience), schedule table, book button                                                    | FR-WEB-DOC-004       |
| `/departments`, `/departments/[slug]`       | Departments                  | Grid; detail with services, doctors                                                                                                 | FR-WEB-DEP-001, -002 |
| `/centres`, `/centres/[slug]`               | Centres of excellence        | Cards; detail                                                                                                                       | FR-WEB-DEP-003       |
| `/packages`, `/packages/[slug]`             | Health packages              | Category tabs, package cards, detail with test groups                                                                               | FR-WEB-PKG-*         |
| `/tests`                                    | Test prices                  | Search, category filter, table on desktop, stacked rows on phone                                                                    | FR-WEB-TST-001       |
| `/book-appointment`                         | Book appointment             | Step indicator, four steps, demo confirmation                                                                                       | FR-WEB-BOOK-*        |
| `/reports`                                  | Online report                | Explainer, lookup form, demo result                                                                                                 | FR-WEB-REP-001       |
| `/sample-collection`                        | Home sample collection       | Request form                                                                                                                        | FR-WEB-SVC-001       |
| `/feedback`                                 | Feedback                     | Form                                                                                                                                | FR-WEB-SVC-002       |
| `/patients-and-visitors`                    | Patient and visitor guide    | Anchored sections, query form                                                                                                       | FR-WEB-SVC-003       |
| `/emergency`                                | Emergency                    | Big call buttons, steps, location                                                                                                   | FR-WEB-SVC-004       |
| `/branches`, `/branches/[slug]`             | Branches                     | Cards, detail with map placeholder                                                                                                  | FR-WEB-INF-001       |
| `/contact`                                  | Contact                      | Branch contacts, form                                                                                                               | FR-WEB-INF-002       |
| `/articles`, `/articles/[slug]`, `/notices` | Articles and notices         | Cards, article layout                                                                                                               | FR-WEB-INF-003       |
| `/about`, `/careers`                        | About, careers               | Content, job list                                                                                                                   | FR-WEB-INF-004       |
| `/portal`                                   | Patient portal (coming soon) | Explainer                                                                                                                           | FR-WEB-INF-006       |
| (any)                                       | Not found                    | Search, links                                                                                                                       | FR-WEB-INF-005       |

All routes exist under `/bn` and `/en`.

## 3. Wireframes (desktop 1366, simplified)

### Shell

```text
+---------------------------------------------------------------------------------+
| [!] Emergency 10XXX   Hotline 10XXX   info@demo.example      Portal  [বাংলা|EN] |  top bar, heading-color band
+---------------------------------------------------------------------------------+
| [LOGO CareSpate]              Doctors  Departments v  Centres  Packages          |
|                               Patients & visitors  Articles  Contact [Book appt] |  header, sticky
+---------------------------------------------------------------------------------+
| Demo content: names, prices and schedules on this site are samples.          [x] |  demo notice
```

### Home

```text
+------------------------------------------+--------------------------------------+
| Care that knows you by name              |                                      |
| One line of supporting text              |        [ hero image slot ]           |
| [ Search doctor, department ...  ][Go]   |        hero-main                     |
| Popular: Cardiology  Child care  Eye     |                                      |
+------------------------------------------+--------------------------------------+
| [Find a doctor] [Book appointment] [Packages] [Online report] [Test prices] [SOS] |  quick actions
+---------------------------------------------------------------------------------+
| Our departments                                                    View all ->  |
| [icon Cardiology] [icon Neurology] [icon Orthopaedics] [icon Paediatrics] ...   |  4 x 3 grid
+---------------------------------------------------------------------------------+
| Centres of excellence     [ image card ][ image card ][ image card ]            |
+---------------------------------------------------------------------------------+
| Meet our specialists  [<]  [doctor card][doctor card][doctor card][doctor card] [>]
+---------------------------------------------------------------------------------+
| Health packages   [All][Women][Men][Senior][Child][Vaccine]                      |
| [package card ৳ sample] [package card] [package card]                           |
+---------------------------------------------------------------------------------+
| Our branches  [branch card] [branch card] [branch card]                         |
+---------------------------------------------------------------------------------+
| Patients & visitors teaser  | Latest articles [card][card][card]                |
+---------------------------------------------------------------------------------+
| 24-hour emergency  [Call 10XXX]  [Ambulance]                                     |  primary band
+---------------------------------------------------------------------------------+
| footer: contact | branches | quick links | legal | Powered by Bytespate         |
```

### Find a doctor

```text
| Find a doctor                                                                   |
| [ Search by name, speciality or interest            ]                           |
| Department: [All v]   Branch: [All v]                       24 doctors found    |
| [photo] Dr. Sample Name        [photo] ...        [photo] ...                    |
|         Senior Consultant                                                        |
|         Cardiology . Gulshan                                                     |
|         [View profile] [Book]                                                    |
```

### Doctor profile

```text
| [photo slot]  Dr. Sample Name                                                    |
|               Senior Consultant, Cardiology                                      |
|               MBBS, FCPS (Medicine) . Speaks Bangla, English                     |
|               [Book appointment]  [Call hotline]                                 |
| [About] [Education] [Experience]          | Chamber schedule                     |
| tab content                               | Sat 09:00-13:00  Level 3, OPD 2      |
|                                           | Mon 17:00-21:00  ...                 |
```

### Book appointment

```text
| Book an appointment   (1) Doctor  (2) Date & time  (3) Your details  (4) Review  |
| Step 2: [ week strip: Sat 25 | Sun 26 | Mon 27 ... ]                             |
|         [09:00][09:15][09:30] ... (from the doctor's schedule, slotMinutes)      |
|                                              [Back]            [Continue]        |
```

### Phone (360)

Top bar collapses to an emergency button and the language switch; the header shows logo, a "Book" button and a menu button; the quick actions become a two-column grid; carousels become horizontal scroll with snap; tables become stacked rows; a sticky bottom bar offers Call and Book.

## 4. Components

| Component              | Where                                                                                                                | Built from                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Button, link-as-button | everywhere                                                                                                           | `Button`, `buttonClassName` (`@hms/ui`)                     |
| Text field, form field | search, forms                                                                                                        | `TextInput`, `Field`                                        |
| Select-like filter     | directory, tests                                                                                                     | `Combobox` or a filter chip row of `Button`                 |
| Tabs                   | profile, packages                                                                                                    | `Tabs`                                                      |
| Menu / mobile panel    | header                                                                                                               | `Menu`, `Dialog` (full-height variant)                      |
| Language switch        | top bar                                                                                                              | `LanguageSwitch`                                            |
| Toast / alert          | demo confirmations                                                                                                   | `Alert` (not toast: confirmations are important, DESIGN.md) |
| Site-only              | header, footer, section heading, department card, doctor card, package card, branch card, step indicator, image slot | `apps/site/src/components`                                  |

## 5. Accessibility and language

- Bangla is reviewed first at 360, 768 and 1366 px; every text block is checked with Bangla about 30 percent longer.
- Every icon sits beside a word. The emergency color is the Danger action red only on the call button, with the word "Emergency".
- Carousels: no auto-play; previous and next buttons with labels; keyboard and swipe.
- Forms: labels above fields, errors in words, required marked in text.

## 6. Image slots and AI prompt list (C-065)

WEB-A ships tokenized SVG placeholders. During T-WEB-14 a file `apps/site/content/image-prompts.md` is written with one prompt per slot; generated files go to `apps/site/public/images/<slot>.webp` and are referenced from content `ImageRef.src`.

| Slot                      | Used on                   | Size (px)  | Prompt direction                                                                                                                          |
| ------------------------- | ------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `hero-main`               | Home hero                 | 1200 x 900 | Bangladeshi doctor and patient in a bright modern consultation room, natural light, teal and white palette, warm and calm, photorealistic |
| `centre-<slug>` (x6)      | Centre cards              | 800 x 600  | The relevant care setting (cardiac lab, maternity suite, ...), no identifiable patients                                                   |
| `department-<slug>` (x12) | Department pages          | 1200 x 600 | Clinical equipment or a care moment for that department                                                                                   |
| `doctor-<slug>` (x24)     | Doctor cards and profiles | 600 x 750  | Portrait of a fictional doctor, neutral background; marked as an illustration in alt text                                                 |
| `branch-<slug>` (x3)      | Branch cards              | 800 x 500  | Exterior of a modern hospital building in Dhaka, daytime                                                                                  |
| `package-<name>` (x10)    | Package cards             | 800 x 500  | Health-check scene matching the package                                                                                                   |
| `article-<slug>` (x6)     | Articles                  | 1200 x 630 | Editorial illustration for the topic                                                                                                      |
| `emergency-band`          | Emergency strip           | 1200 x 900 | Ambulance at the entrance at blue hour, in the band's dark teal with one red beacon, no faces                                             |

AI-generated faces of "doctors" are illustrations, not real staff; alt text says so (P-032).

## 7. Motion and animation libraries (C-083, C-084, C-085)

Motion on the site has one job: make the page feel cared for without slowing anyone down. Every effect below is removed for visitors with reduced motion turned on, and nothing animates on keyboard actions.

### What moves, where and why

| Effect                                                                                                                                                                 | Where                                                 | Why                                                                                                                                                                                  | Built with          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Arrival: text settles in one element after another                                                                                                                     | Home hero, every inner page title                     | Guides the eye from the headline to the search and the emergency line                                                                                                                | CSS (`motion.css`)  |
| Scroll reveal: each section fades and rises in, then its cards one after another                                                                                       | Every section below the first screen, every card list | Shows where a new section starts; only parts still below the fold are hidden, and only after the page loads                                                                          | Motion              |
| Card lift, picture zoom, icon fill, arrow nudge                                                                                                                        | All cards, "view all" links, quick actions            | Tells a mouse user "this is clickable"; off on touch screens                                                                                                                         | CSS                 |
| Header shadow on scroll                                                                                                                                                | Sticky header                                         | Separates the header from the page once content slides under it                                                                                                                      | CSS scroll timeline |
| Dropdown and suggestions grow from their trigger                                                                                                                       | Departments menu, hero search                         | Shows where the panel came from                                                                                                                                                      | CSS                 |
| FAQ answers and menu groups open to their height                                                                                                                       | FAQ, mobile menu                                      | No jump; the eye follows the answer                                                                                                                                                  | CSS                 |
| Booking step rises in, confirmation pops                                                                                                                               | Booking wizard                                        | Makes the change of step visible; marks success                                                                                                                                      | CSS                 |
| Soft repeating ring                                                                                                                                                    | Emergency icon (hero line, emergency band)            | The one "open now" signal; the only repeating motion on the site                                                                                                                     | CSS                 |
| Stats count up                                                                                                                                                         | Stats section (hidden in the current content)         | Draws attention to the numbers once                                                                                                                                                  | Small script        |
| Slider with previous and next buttons                                                                                                                                  | Home: featured doctors, health packages               | One row instead of two; swipe on phones; never auto-plays                                                                                                                            | Embla Carousel      |
| Cards glide out, in and into place when the list changes                                                                                                               | Doctor directory filters, site search results         | Shows what a filter removed or added instead of a sudden jump                                                                                                                        | AutoAnimate         |
| Hero slideshow: the next picture morphs in (grows out of a soft blurred shape and sharpens) while the current one blurs away; a link chip per service; a progress line | Home hero                                             | Shows more of the hospital than one picture; no controls (owner, 2026-10-22); pauses under the pointer, on focus and in a hidden tab; stays on the first picture with reduced motion | Motion              |
| Services strip drifts slowly across                                                                                                                                    | Home, under the quick actions                         | Lists services and facilities without another grid; pauses under the pointer, wraps still with reduced motion                                                                        | react-fast-marquee  |
| Success tick draws itself                                                                                                                                              | After every sent form and a confirmed booking         | Marks success at a glance before the words are read                                                                                                                                  | Lottie              |
| "Link copied" toast                                                                                                                                                    | Share button on doctor profiles and articles          | Confirms an action that otherwise has no visible result                                                                                                                              | Sonner              |
| Menu as a bottom sheet that follows the finger                                                                                                                         | Phone and tablet menu                                 | Reachable with the thumb; drag down to close                                                                                                                                         | Vaul                |
| Search bar drops in under the header                                                                                                                                   | Header search on every page                           | Shows where the bar came from; results appear as you type                                                                                                                            | CSS                 |

### Libraries in use

| Library                               | Used for                                 | Why this one                                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `embla-carousel-react` 8.6.0          | Featured doctors and packages sliders    | Small, touch-first, no styling of its own (our cards and tokens stay in charge), works with keyboard focus and the APG carousel pattern. Swiper does the same job but is several times heavier.   |
| `@formkit/auto-animate` 0.10.0        | Doctor directory and site search results | One line per list, no layout code, and it turns itself off for reduced motion. Motion (Framer Motion) could do it but is far larger for this one job.                                             |
| `motion` 13.5.1                       | Hero slideshow, scroll reveal            | Small vanilla `animate`/`inView` for the reveal and React `AnimatePresence` for the slides; works in every browser, unlike CSS scroll timelines (C-085).                                          |
| `lottie-web` 5.13.0 (light player)    | Success tick                             | Plays a designer-style vector animation from a tiny JSON file (`src/motion/success-tick.json`); the light SVG player runs no `eval`, so the CSP stays as it is. Loaded only when a tick is shown. |
| `react-fast-marquee` 1.6.5            | Services strip                           | A seamless loop with pause on hover in one component; screen readers get a plain list instead.                                                                                                    |
| `sonner` 2.0.8                        | "Link copied" toast                      | Accessible toasts that stack and swipe away; placed above the phone action bar.                                                                                                                   |
| `vaul` 1.1.2                          | Phone menu                               | A drawer that follows the finger, built on the Radix dialog (focus trap, Escape, focus return).                                                                                                   |
| CSS only (`apps/site/app/motion.css`) | Everything else in the table above       | Runs off the main thread, needs no script and no CSP change, and falls back to a still page.                                                                                                      |

### Considered and not used

| Library                     | Why not                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed.js, typewriter-effect | They type one character at a time, which breaks Bangla conjunct letters (juktakkhor) mid-word; they also delay the main headline and read badly on screen readers. Swap whole words if ever needed. |
| Swiper                      | Heavier than Embla for the same two sliders.                                                                                                                                                        |
| GSAP                        | Motion covers the slideshow and the reveal; GSAP would add a second animation engine. Revisit only for pinned storytelling pages.                                                                   |
| Lenis (smooth scroll)       | Changes how the page scrolls; feels wrong to everyday users and older phones.                                                                                                                       |
| canvas-confetti, particles  | Wrong tone for a hospital.                                                                                                                                                                          |

Rules for adding motion later: give each effect a reason from the table's "Why" column; keep interface animations under 300 ms; auto-play only the hero slideshow, which pauses under the pointer and never plays with reduced motion (C-085), never the card sliders; never start from `scale(0)`; gate everything on `prefers-reduced-motion`; add a dependency only when CSS cannot do the job, pinned to an exact version.

### Loading states (T-WEB-15)

| State         | Where                                                        | How                                                                                 |
| ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Page change   | Every link to another page                                   | Thin teal progress bar at the top, only if the change takes over 150 ms             |
| Skeleton      | Booking wizard, site search                                  | `Skeleton` blocks shaped like the real layout until the browser renders the part    |
| Photo loading | Every image slot with a photo                                | Shimmer in the frame, then the photo fades in; without script the photo shows as-is |
| Sending       | Contact, appointment request, service forms, booking confirm | Button spinner and "Sending...", form `aria-busy`, button disabled                  |

Pages are static HTML, so they get no route loading screens: a `loading.tsx` makes Next send every page as a skeleton with the real content hidden until a script swaps it in, which breaks no-script reading, delays the largest paint and turns the not-found page into a 200.

## CMS demo admin (C-091, C-092)

The first CMS interface is a fictional browser-only demonstration inside `apps/site`, at `/cms/bn` and `/cms/en`. It reuses the staff design system, AppShell, PageLayout and form controls. Navigation offers Pages, Settings and branding, Menus and footer, and Version history. Draft and published previews reuse the public renderer. All commands explicitly describe their demo scope; no account or real data is required. Surface details and the established-system direction contract are in [CMS-demo-design](CMS-demo-design.md).

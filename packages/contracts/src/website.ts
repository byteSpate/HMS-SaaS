// Public website content: site settings, navigation, pages built from a fixed catalog of section
// types, and the content collections (doctors, departments, packages, ...). The same schemas are
// used by the mock content in apps/site now and by the website CMS editor and API later, so a
// field cannot exist in one place and not another. Implements: T-WEB-04, P-036, P-040, C-070,
// C-072, docs/site-planning/E-content-model.md.
import { z } from 'zod';
import { isAccessibleWebsiteColor } from './website-brand.js';

// Shared value types (E section 1)

const nonEmpty = z.string().trim().min(1);

/** Visitor-facing text in both site languages; both are required (C-062). */
export const localizedTextSchema = z.object({ bn: nonEmpty, en: nonEmpty }).strict();
export type LocalizedText = z.infer<typeof localizedTextSchema>;

/** Paragraphs only. Content is never HTML, so it is always rendered as text (C-080). */
export const localizedRichTextSchema = z
  .object({ bn: z.array(nonEmpty).min(1), en: z.array(nonEmpty).min(1) })
  .strict();
export type LocalizedRichText = z.infer<typeof localizedRichTextSchema>;

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase a-z0-9-');

/** Exact taka amount as a decimal string (ADR-007); never a floating point number. */
export const moneySchema = z.string().regex(/^\d+\.\d{2}$/, 'decimal string like 40700.00');

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm');
export const isoDateSchema = z.iso.date();

/** The week starts on Saturday, as on Bangladeshi hospital schedules. */
export const weekdays = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export const weekdaySchema = z.enum(weekdays);
export type Weekday = z.infer<typeof weekdaySchema>;

/** A named image slot; without `src` the site shows the slot's placeholder (C-065). */
export const imageRefSchema = z
  .object({
    slot: slugSchema,
    src: z
      .string()
      .regex(/^\/images\/[a-z0-9-]+\.(webp|jpg|png)$/)
      .optional(),
    alt: localizedTextSchema,
  })
  .strict();
export type ImageRef = z.infer<typeof imageRefSchema>;

/** Site-relative paths, `tel:` and `mailto:` links, or https URLs; nothing else (no javascript:). */
export const hrefSchema = z
  .string()
  .regex(/^(\/[a-z0-9\-/#?=&]*|tel:\+?\d+|mailto:[^\s]+|https:\/\/[^\s]+)$/, 'safe link');

export interface MenuItem {
  label: LocalizedText;
  href: string;
  children?: MenuItem[];
}
export const menuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z
    .object({
      label: localizedTextSchema,
      href: hrefSchema,
      children: z.array(menuItemSchema).optional(),
    })
    .strict(),
);

/** Icon names are checked against `@hms/ui` by the site; contracts depend only on zod. */
const iconSchema = z.string().regex(/^[a-z]+(?:-[a-z]+)*$/);

export const phoneSchema = z
  .object({ display: nonEmpty, tel: z.string().regex(/^\+?\d+$/) })
  .strict();
export type Phone = z.infer<typeof phoneSchema>;

// Site settings, theme, navigation and footer (site.json)

export const socialNetworks = ['facebook', 'youtube', 'instagram', 'linkedin', 'whatsapp'] as const;

export const siteSchema = z
  .object({
    settings: z
      .object({
        hospitalName: localizedTextSchema,
        shortName: localizedTextSchema,
        tagline: localizedTextSchema,
        contacts: z
          .object({
            hotline: phoneSchema,
            hotlineOutsideDhaka: phoneSchema,
            emergency: phoneSchema,
            ambulance: phoneSchema,
            email: z.email(),
          })
          .strict(),
        socialLinks: z.array(
          z.object({ network: z.enum(socialNetworks), url: hrefSchema }).strict(),
        ),
        defaultBranch: slugSchema,
      })
      .strict(),
    theme: z
      .object({
        logo: imageRefSchema,
        favicon: imageRefSchema.optional(),
        primaryOverride: z
          .string()
          .refine(isAccessibleWebsiteColor, 'Color must contrast with all website surfaces')
          .nullable(),
        preset: z.enum(['clinical', 'spacious']).default('clinical'),
        font: z.enum(['hind', 'noto']).default('hind'),
      })
      .strict(),
    navigation: z
      .object({
        topBar: z.array(menuItemSchema),
        header: z.array(menuItemSchema).min(1),
        headerCta: menuItemSchema,
      })
      .strict(),
    footer: z
      .object({
        columns: z.array(
          z.object({ title: localizedTextSchema, links: z.array(menuItemSchema) }).strict(),
        ),
        note: localizedTextSchema,
      })
      .strict(),
    notice: z.object({ enabled: z.boolean(), text: localizedTextSchema }).strict(),
  })
  .strict();
export type Site = z.infer<typeof siteSchema>;

// Sections: a fixed catalog; each type has its own props schema (P-036, E section 2)

function section<T extends string, P extends z.ZodType>(type: T, props: P) {
  return z
    .object({ id: slugSchema, type: z.literal(type), hidden: z.boolean().optional(), props })
    .strict();
}

const headed = { heading: localizedTextSchema, text: localizedTextSchema.optional() };
const listed = { ...headed, count: z.number().int().min(1).max(24), viewAll: menuItemSchema };

export const sectionSchema = z.discriminatedUnion('type', [
  section(
    'hero',
    z
      .object({
        heading: localizedTextSchema,
        text: localizedTextSchema,
        image: imageRefSchema,
        // More pictures after `image` turn the hero picture into a slideshow (C-085); each one
        // carries a short link to the service it shows.
        slides: z
          .array(z.object({ image: imageRefSchema, link: menuItemSchema }).strict())
          .max(5)
          .optional(),
        search: z.boolean(),
        popularLinks: z.array(menuItemSchema).max(6),
      })
      .strict(),
  ),
  section(
    'quickActions',
    z
      .object({
        items: z
          .array(
            z.object({ icon: iconSchema, label: localizedTextSchema, href: hrefSchema }).strict(),
          )
          .min(2)
          .max(8),
      })
      .strict(),
  ),
  // A slowly moving strip of services and facilities under the hero (C-085).
  section(
    'serviceStrip',
    z
      .object({
        label: localizedTextSchema,
        items: z
          .array(z.object({ icon: iconSchema, label: localizedTextSchema }).strict())
          .min(4)
          .max(16),
      })
      .strict(),
  ),
  section('departmentGrid', z.object(listed).strict()),
  section('centreCards', z.object({ ...headed, centres: z.array(slugSchema).min(1) }).strict()),
  section(
    'featuredDoctors',
    z
      .object({
        ...headed,
        doctors: z.union([z.literal('featured'), z.array(slugSchema).min(1)]),
        viewAll: menuItemSchema,
      })
      .strict(),
  ),
  section('packageShowcase', z.object(listed).strict()),
  section('branchCards', z.object(headed).strict()),
  section('articleList', z.object(listed).strict()),
  section(
    'emergencyBand',
    z
      .object({ heading: localizedTextSchema, text: localizedTextSchema, image: imageRefSchema })
      .strict(),
  ),
  section(
    'richText',
    z.object({ heading: localizedTextSchema.optional(), body: localizedRichTextSchema }).strict(),
  ),
  section(
    'imageText',
    z
      .object({
        heading: localizedTextSchema,
        body: localizedRichTextSchema,
        image: imageRefSchema,
        imageSide: z.enum(['start', 'end']),
        link: menuItemSchema.optional(),
      })
      .strict(),
  ),
  section(
    'callToAction',
    z
      .object({ heading: localizedTextSchema, text: localizedTextSchema, button: menuItemSchema })
      .strict(),
  ),
  section(
    'faq',
    z
      .object({
        heading: localizedTextSchema,
        items: z
          .array(
            z.object({ question: localizedTextSchema, answer: localizedRichTextSchema }).strict(),
          )
          .min(1),
      })
      .strict(),
  ),
  section(
    'stats',
    z
      .object({
        heading: localizedTextSchema.optional(),
        items: z.array(z.object({ value: nonEmpty, label: localizedTextSchema }).strict()).min(1),
      })
      .strict(),
  ),
  section(
    'gallery',
    z.object({ heading: localizedTextSchema, images: z.array(imageRefSchema).min(1) }).strict(),
  ),
  section(
    'appointmentRequest',
    z.object({ ...headed, department: slugSchema.optional() }).strict(),
  ),
  section('guideSections', z.object({ heading: localizedTextSchema.optional() }).strict()),
]);
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section['type'];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;

export const pageSchema = z
  .object({
    path: z.string().regex(/^\/[a-z0-9\-/]*$/),
    title: localizedTextSchema,
    seo: z
      .object({
        title: localizedTextSchema,
        description: localizedTextSchema,
        image: imageRefSchema.optional(),
      })
      .strict(),
    sections: z.array(sectionSchema),
  })
  .strict()
  .refine((page) => new Set(page.sections.map((s) => s.id)).size === page.sections.length, {
    message: 'section ids must be unique within a page',
  });
export type Page = z.infer<typeof pageSchema>;

// Collections (E section 2)

const sessionSchema = z.object({ start: timeSchema, end: timeSchema }).strict();

export const departmentSchema = z
  .object({
    slug: slugSchema,
    name: localizedTextSchema,
    icon: iconSchema,
    summary: localizedTextSchema,
    overview: localizedRichTextSchema,
    services: z.array(localizedTextSchema).min(1),
    facilities: z.array(localizedTextSchema),
    /** Symptoms and everyday words patients search with ("chest pain"), so search finds the department. */
    keywords: z.array(localizedTextSchema).optional(),
    centre: slugSchema.optional(),
    image: imageRefSchema,
    floor: localizedTextSchema,
    opdHours: z.array(
      z.object({ day: weekdaySchema, sessions: z.array(sessionSchema).min(1) }).strict(),
    ),
  })
  .strict();
export type Department = z.infer<typeof departmentSchema>;

export const centreSchema = z
  .object({
    slug: slugSchema,
    name: localizedTextSchema,
    summary: localizedTextSchema,
    overview: localizedRichTextSchema,
    departments: z.array(slugSchema).min(1),
    highlights: z.array(localizedTextSchema),
    image: imageRefSchema,
  })
  .strict();
export type Centre = z.infer<typeof centreSchema>;

export const doctorLanguages = ['bn', 'en', 'hi', 'ar'] as const;
export type DoctorLanguage = (typeof doctorLanguages)[number];

export const doctorSchema = z
  .object({
    slug: slugSchema,
    name: localizedTextSchema,
    title: localizedTextSchema,
    department: slugSchema,
    branches: z.array(slugSchema).min(1),
    qualifications: localizedTextSchema,
    languages: z.array(z.enum(doctorLanguages)).min(1),
    gender: z.enum(['female', 'male']),
    about: localizedRichTextSchema,
    education: z.array(
      z
        .object({
          degree: localizedTextSchema,
          institution: localizedTextSchema,
          year: z.number().int().min(1950).max(2100),
        })
        .strict(),
    ),
    experience: z.array(
      z
        .object({
          role: localizedTextSchema,
          place: localizedTextSchema,
          from: z.number().int(),
          to: z.number().int().optional(),
        })
        .strict(),
    ),
    interests: z.array(localizedTextSchema),
    schedule: z
      .array(
        z
          .object({
            day: weekdaySchema,
            start: timeSchema,
            end: timeSchema,
            branch: slugSchema,
            room: localizedTextSchema,
          })
          .strict(),
      )
      .min(1),
    slotMinutes: z.number().int().min(5).max(60),
    fee: moneySchema.optional(),
    featured: z.boolean(),
    leave: z.array(
      z
        .object({
          from: isoDateSchema,
          to: isoDateSchema,
          message: localizedTextSchema.optional(),
        })
        .strict(),
    ),
    image: imageRefSchema,
  })
  .strict();
export type Doctor = z.infer<typeof doctorSchema>;

export const packageCategories = [
  'general',
  'women',
  'men',
  'senior',
  'child',
  'vaccine',
  'corporate',
] as const;
export type PackageCategory = (typeof packageCategories)[number];

export const healthPackageSchema = z
  .object({
    slug: slugSchema,
    code: z.string().regex(/^[A-Z]{2,5}-\d{2,3}$/),
    name: localizedTextSchema,
    category: z.enum(packageCategories),
    audience: localizedTextSchema,
    summary: localizedTextSchema,
    groups: z
      .array(
        z
          .object({ title: localizedTextSchema, tests: z.array(localizedTextSchema).min(1) })
          .strict(),
      )
      .min(1),
    preparation: z.array(localizedTextSchema),
    price: moneySchema,
    separatePrice: moneySchema,
    doctorFeeNote: localizedTextSchema.optional(),
    image: imageRefSchema,
  })
  .strict();
export type HealthPackage = z.infer<typeof healthPackageSchema>;

export const testCategories = [
  'pathology',
  'biochemistry',
  'imaging',
  'cardiology',
  'other',
] as const;
export type TestCategory = (typeof testCategories)[number];

export const testPriceSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2,5}-[A-Z0-9]{2,8}$/),
    name: localizedTextSchema,
    category: z.enum(testCategories),
    price: moneySchema,
    preparation: localizedTextSchema.optional(),
    reportTime: localizedTextSchema,
    branches: z.array(slugSchema).min(1),
  })
  .strict();
export type TestPrice = z.infer<typeof testPriceSchema>;

export const branchSchema = z
  .object({
    slug: slugSchema,
    name: localizedTextSchema,
    address: localizedTextSchema,
    area: localizedTextSchema,
    hours: localizedTextSchema,
    phone: phoneSchema,
    services: z.array(localizedTextSchema),
    emergency: z.boolean(),
    image: imageRefSchema,
    head: z.object({ name: localizedTextSchema, title: localizedTextSchema }).strict(),
    units: z.array(z.object({ name: localizedTextSchema, location: localizedTextSchema }).strict()),
  })
  .strict();
export type Branch = z.infer<typeof branchSchema>;

export const articleSchema = z
  .object({
    slug: slugSchema,
    title: localizedTextSchema,
    category: localizedTextSchema,
    excerpt: localizedTextSchema,
    body: localizedRichTextSchema,
    author: slugSchema.optional(),
    department: slugSchema.optional(),
    publishedOn: isoDateSchema,
    image: imageRefSchema,
  })
  .strict();
export type Article = z.infer<typeof articleSchema>;

export const noticeSchema = z
  .object({
    id: slugSchema,
    title: localizedTextSchema,
    body: localizedRichTextSchema,
    publishedOn: isoDateSchema,
  })
  .strict();
export type Notice = z.infer<typeof noticeSchema>;

export const jobOpeningSchema = z
  .object({
    id: slugSchema,
    title: localizedTextSchema,
    department: localizedTextSchema,
    type: z.enum(['full-time', 'part-time', 'contract']),
    location: slugSchema,
    closingOn: isoDateSchema,
    summary: localizedTextSchema,
  })
  .strict();
export type JobOpening = z.infer<typeof jobOpeningSchema>;

export const guideSectionSchema = z
  .object({ id: slugSchema, title: localizedTextSchema, body: localizedRichTextSchema })
  .strict();
export type GuideSection = z.infer<typeof guideSectionSchema>;

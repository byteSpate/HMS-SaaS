// Browser-only website demo schemas. T-CMS-DEMO-01, C-086..C-092.
import { z } from 'zod';
import { pageSchema, siteSchema } from './website.js';

export const cmsSnapshotSchema = z
  .object({
    site: siteSchema,
    pages: z.array(pageSchema).min(1).max(100),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const paths = snapshot.pages.map((page) => page.path);
    const seen = new Set<string>();
    paths.forEach((path, index) => {
      if (seen.has(path))
        ctx.addIssue({
          code: 'custom',
          path: ['pages', index, 'path'],
          message: 'Unique page paths are required',
        });
      seen.add(path);
    });
    if (!snapshot.site.notice.enabled)
      ctx.addIssue({
        code: 'custom',
        path: ['site', 'notice', 'enabled'],
        message: 'Demo notice remains required until ERP collections are connected',
      });
    const requiredPaths = ['/', '/about', '/patients-and-visitors', '/emergency', '/portal'];
    if (requiredPaths.some((path) => !paths.includes(path)))
      ctx.addIssue({ code: 'custom', message: 'Built-in pages must be retained' });
    const reserved = /^\/(cms|staff|api|_next|login|choose-hospital)(\/|$)/;
    const fixedRoutes =
      /^\/(doctors|departments|centres|packages|tests|branches|articles|book-appointment|reports|sample-collection|feedback|contact|notices|careers|search)(\/|$)/;
    paths.forEach((path, index) => {
      if (reserved.test(path) || fixedRoutes.test(path))
        ctx.addIssue({
          code: 'custom',
          path: ['pages', index, 'path'],
          message: 'Page path is reserved',
        });
    });
  });
export type CmsSnapshot = z.infer<typeof cmsSnapshotSchema>;
export const cmsDraftSchema = z.object({
  revision: z.number().int().min(0),
  publishedRevision: z.number().int().nullable(),
  snapshot: cmsSnapshotSchema.nullable(),
});
export type CmsDraft = z.infer<typeof cmsDraftSchema>;
export const cmsVersionSchema = z.object({
  id: z.uuid(),
  revision: z.number().int(),
  publishedAt: z.iso.datetime(),
});
export type CmsVersion = z.infer<typeof cmsVersionSchema>;
export const cmsVersionsSchema = z.array(cmsVersionSchema);
export const cmsDemoStateSchema = z
  .object({
    draft: cmsDraftSchema,
    versions: z.array(cmsVersionSchema.extend({ snapshot: cmsSnapshotSchema })).max(20),
    publishedId: z.uuid().nullable(),
  })
  .strict();
export type CmsDemoState = z.infer<typeof cmsDemoStateSchema>;

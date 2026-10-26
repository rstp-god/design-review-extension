import { z } from 'zod'

/**
 * Zod schemas are the single source of truth for the data model (spec 5.3). Types are inferred
 * from them and re-exported by `model.ts`. Everything that crosses a context boundary (messages,
 * `chrome.storage`, IndexedDB records) is validated against these.
 */

export const SEVERITIES = ['blocker', 'major', 'minor'] as const
export const SESSION_SCOPES = ['domain', 'page'] as const
export const TOOLTIP_FIELDS = ['typography', 'colors', 'spacing', 'size', 'radius'] as const
export const COLOR_FORMATS = ['hex', 'rgb', 'hsl'] as const
export const UNITS = ['px', 'rem'] as const
export const CROP_PADDINGS = [0, 16, 24, 48] as const
export const FREEZE_DELAYS = [3, 5, 10] as const
export const THEMES = ['light', 'dark', 'system'] as const
export const REPORT_LANGS = ['ru', 'en'] as const
export const SHOT_QUALITIES = ['low', 'medium', 'high'] as const

export const severitySchema = z.enum(SEVERITIES)
export const sessionScopeSchema = z.enum(SESSION_SCOPES)
export const tooltipFieldSchema = z.enum(TOOLTIP_FIELDS)
export const colorFormatSchema = z.enum(COLOR_FORMATS)
export const unitsSchema = z.enum(UNITS)
export const cropPaddingSchema = z.union([
  z.literal(0),
  z.literal(16),
  z.literal(24),
  z.literal(48),
])
export const freezeDelaySchema = z.union([z.literal(3), z.literal(5), z.literal(10)])
export const themeSchema = z.enum(THEMES)
export const reportLangSchema = z.enum(REPORT_LANGS)
export const shotQualitySchema = z.enum(SHOT_QUALITIES)

export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
})

export const envSchema = z.object({
  viewport: z.object({ w: z.number().nonnegative(), h: z.number().nonnegative() }),
  dpr: z.number().positive(),
  userAgent: z.string(),
})

export const reviewSessionSchema = z.object({
  id: z.string().min(1),
  /** Fixed at creation; the settings only affect new sessions. */
  scope: sessionScopeSchema,
  /** `domain`: origin · `page`: origin + normalized pathname, no query, no hash. */
  key: z.string().min(1),
  origin: z.string().min(1),
  /** Normalized pathname, only for `scope: 'page'`. */
  path: z.string().optional(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Next issue number; numbers are never reused after deletion. */
  nextNumber: z.number().int().positive(),
})

export const issueTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('element'),
    selector: z.string(),
    path: z.array(z.string()),
    rect: rectSchema,
  }),
  z.object({ kind: z.literal('area'), rect: rectSchema }),
])

export const issueSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  number: z.number().int().positive(),
  pageUrl: z.string(),
  pagePath: z.string(),
  pageTitle: z.string(),
  env: envSchema,
  severity: severitySchema,
  text: z.string(),
  target: issueTargetSchema,
  source: z.enum(['live', 'snapshot']),
  snapshotAt: z.string().optional(),
  clipped: z.boolean().optional(),
  scroll: z.object({ x: z.number(), y: z.number() }),
  styles: z.record(z.string(), z.string()).optional(),
  shots: z.object({ cropId: z.string(), viewportId: z.string() }),
  status: z.enum(['open', 'resolved']),
  external: z.object({ tracker: z.string(), key: z.string(), url: z.string() }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Settings live in `chrome.storage.sync`. Each field falls back to its default on its own, so a
 * single corrupt or outdated value never resets the rest. `reportLang` defaults to the UI
 * language at store creation (see `defaultSettings`); `en` here is only the schema-level fallback.
 */
export const settingsSchema = z.object({
  sessionScope: sessionScopeSchema.catch('domain'),
  reviewer: z.string().max(120).catch(''),
  reportLang: reportLangSchema.catch('en'),
  shotQuality: shotQualitySchema.catch('medium'),
  tooltipFields: z.array(tooltipFieldSchema).catch(['typography', 'colors', 'spacing', 'size']),
  colorFormat: colorFormatSchema.catch('hex'),
  units: unitsSchema.catch('px'),
  cropPadding: cropPaddingSchema.catch(24),
  freezeDelay: freezeDelaySchema.catch(5),
  defaultSeverity: severitySchema.catch('major'),
  theme: themeSchema.catch('system'),
})

/** Toolbar position (viewport px, top-left corner) and collapsed flag; `chrome.storage.local`. */
export const toolbarStateSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  collapsed: z.boolean().catch(false),
})

export const severityCountsSchema = z.object({
  blocker: z.number().int().nonnegative(),
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
})

/** What the popup and the overlay need to know about a session without loading its issues. */
export const sessionSummarySchema = z.object({
  session: reviewSessionSchema,
  issueCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  bySeverity: severityCountsSchema,
})

export const storageUsageSchema = z.object({
  bytes: z.number().nonnegative(),
  /** Origin quota as reported by the browser; absent when the API is unavailable. */
  quota: z.number().nonnegative().optional(),
  sessions: z.number().int().nonnegative(),
})

export type Severity = z.infer<typeof severitySchema>
export type SessionScope = z.infer<typeof sessionScopeSchema>
export type TooltipField = z.infer<typeof tooltipFieldSchema>
export type ColorFormat = z.infer<typeof colorFormatSchema>
export type Units = z.infer<typeof unitsSchema>
export type CropPadding = z.infer<typeof cropPaddingSchema>
export type FreezeDelay = z.infer<typeof freezeDelaySchema>
export type Theme = z.infer<typeof themeSchema>
export type ReportLang = z.infer<typeof reportLangSchema>
export type ShotQuality = z.infer<typeof shotQualitySchema>
export type Rect = z.infer<typeof rectSchema>
export type Env = z.infer<typeof envSchema>
export type ReviewSession = z.infer<typeof reviewSessionSchema>
export type IssueTarget = z.infer<typeof issueTargetSchema>
export type Issue = z.infer<typeof issueSchema>
export type Settings = z.infer<typeof settingsSchema>
export type ToolbarState = z.infer<typeof toolbarStateSchema>
export type SeverityCounts = z.infer<typeof severityCountsSchema>
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type StorageUsage = z.infer<typeof storageUsageSchema>

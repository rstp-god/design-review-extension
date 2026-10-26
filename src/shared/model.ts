import type { ReportLang, Settings, SeverityCounts } from './schemas'

export type {
  ColorFormat,
  CropPadding,
  Env,
  FreezeDelay,
  Issue,
  IssueTarget,
  Rect,
  ReportLang,
  ReviewSession,
  SessionScope,
  SessionSummary,
  Settings,
  Severity,
  SeverityCounts,
  ShotQuality,
  StorageUsage,
  Theme,
  ToolbarState,
  TooltipField,
  Units,
} from './schemas'
export {
  COLOR_FORMATS,
  CROP_PADDINGS,
  FREEZE_DELAYS,
  REPORT_LANGS,
  SESSION_SCOPES,
  SEVERITIES,
  SHOT_QUALITIES,
  THEMES,
  TOOLTIP_FIELDS,
  UNITS,
} from './schemas'

/** Spec 3.10 defaults. `reportLang` follows the UI language of the browser. */
export function defaultSettings(uiLanguage: ReportLang = 'en'): Settings {
  return {
    sessionScope: 'domain',
    reviewer: '',
    reportLang: uiLanguage,
    shotQuality: 'medium',
    tooltipFields: ['typography', 'colors', 'spacing', 'size'],
    colorFormat: 'hex',
    units: 'px',
    cropPadding: 24,
    freezeDelay: 5,
    defaultSeverity: 'major',
    theme: 'system',
  }
}

export const EMPTY_SEVERITY_COUNTS: Readonly<SeverityCounts> = Object.freeze({
  blocker: 0,
  major: 0,
  minor: 0,
})

/**
 * `data-testid` values shared by components and tests. Every interactive element gets one.
 * Dynamic ids (per option, per field, per session) come from `testIds.*` helpers.
 */
export const TestId = {
  // Popup — home
  PopupRoot: 'popup-root',
  PopupSettingsButton: 'popup-settings-button',
  PopupBackButton: 'popup-back-button',
  PopupSession: 'popup-session',
  PopupSessionScope: 'popup-session-scope',
  PopupSessionHost: 'popup-session-host',
  PopupSessionPath: 'popup-session-path',
  PopupSessionSummary: 'popup-session-summary',
  PopupStart: 'popup-start',
  PopupShortcut: 'popup-shortcut',
  PopupShortcutSetup: 'popup-shortcut-setup',
  PopupExportHtml: 'popup-export-html',
  PopupExportPdf: 'popup-export-pdf',
  PopupRecent: 'popup-recent',
  PopupOnboarding: 'popup-onboarding',
  PopupRestricted: 'popup-restricted',
  PopupError: 'popup-error',
  PopupStorage: 'popup-storage',
  PopupVersion: 'popup-version',

  // Popup — settings
  SettingsRoot: 'settings-root',
  SettingScope: 'setting-scope',
  SettingReviewer: 'setting-reviewer',
  SettingReportLang: 'setting-report-lang',
  SettingShotQuality: 'setting-shot-quality',
  SettingColorFormat: 'setting-color-format',
  SettingUnits: 'setting-units',
  SettingCropPadding: 'setting-crop-padding',
  SettingFreezeDelay: 'setting-freeze-delay',
  SettingDefaultSeverity: 'setting-default-severity',
  SettingTheme: 'setting-theme',
  SettingsShortcutsLink: 'settings-shortcuts-link',
  SettingsStorageUsage: 'settings-storage-usage',
  SettingsDeleteAll: 'settings-delete-all',
  SettingsDeleteAllConfirm: 'settings-delete-all-confirm',
  SettingsDeleteAllCancel: 'settings-delete-all-cancel',
  SettingsDeleteAllError: 'settings-delete-all-error',

  // Overlay
  Toolbar: 'toolbar',
  ToolbarGrip: 'toolbar-grip',
  ToolbarPicker: 'toolbar-picker',
  ToolbarArea: 'toolbar-area',
  ToolbarFreeze: 'toolbar-freeze',
  ToolbarIssues: 'toolbar-issues',
  ToolbarIssuesBadge: 'toolbar-issues-badge',
  ToolbarExport: 'toolbar-export',
  ToolbarCollapse: 'toolbar-collapse',
  ToolbarExit: 'toolbar-exit',
  ToolbarCollapsed: 'toolbar-collapsed',
  ToolbarCollapsedBadge: 'toolbar-collapsed-badge',
  OverlayHint: 'overlay-hint',

  // Picker
  PickerHighlight: 'picker-highlight',
  PickerHighlightMargin: 'picker-highlight-margin',
  PickerHighlightBorder: 'picker-highlight-border',
  PickerHighlightPadding: 'picker-highlight-padding',
  PickerHighlightContent: 'picker-highlight-content',
  PickerTooltip: 'picker-tooltip',
  PickerTooltipTag: 'picker-tooltip-tag',
  PickerTooltipSize: 'picker-tooltip-size',
  PickerLockedFrame: 'picker-locked-frame',
  PickerLockedChip: 'picker-locked-chip',
  PickerLockedBar: 'picker-locked-bar',
  PickerBreadcrumbs: 'picker-breadcrumbs',
  PickerHintEnter: 'picker-hint-enter',

  // UI primitives
  Tooltip: 'ui-tooltip',
  Menu: 'ui-menu',
  Dialog: 'ui-dialog',
  DialogScrim: 'ui-dialog-scrim',
} as const

export type TestIdValue = (typeof TestId)[keyof typeof TestId]

export const testIds = {
  segmentOption: (group: string, value: string | number) => `${group}-option-${value}`,
  tooltipField: (field: string) => `setting-tooltip-field-${field}`,
  recentItem: (sessionId: string) => `popup-recent-item-${sessionId}`,
  recentMenu: (sessionId: string) => `popup-recent-menu-${sessionId}`,
  menuItem: (id: string) => `ui-menu-item-${id}`,
  pickerRow: (key: string) => `picker-tooltip-row-${key}`,
  pickerBreadcrumb: (index: number) => `picker-breadcrumb-${index}`,
} as const

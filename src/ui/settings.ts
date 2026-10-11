import { stellariaFlower } from './art';

// Settings, everywhere: one column of rows, the Stellari rising half out of the panel's foot -----------------

/** A setting: its name on the left, its value on the right (the value relabelled in place as it changes). */
export function setRow(act: string, label: string, value: string, attrs = ''): string {
  return `<button class="set-row" data-act="${act}" ${attrs}><span class="set-label">${label}</span><b class="opt-value">${value}</b></button>`;
}
/** A way somewhere else from the settings (the log, the rules, quitting). */
export function setLink(act: string, label: string, attrs = ''): string {
  return `<button class="set-row set-link" data-act="${act}" ${attrs}><span class="set-label">${label}</span><i aria-hidden="true">›</i></button>`;
}
/**
 * The settings, as one column [direction: a single column, less bland, with a Stellari at the bottom, half off it and
 * hidden by the panel's edge].
 */
export function settingsPanel(rows: string, note = ''): string {
  return `<div class="settings-panel"><div class="set-list">${rows}</div>${note}<i class="settings-flower" aria-hidden="true">${stellariaFlower()}</i></div>`;
}

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
export function settingsPanel(rows: string, note = '', flower = false): string {
  return `<div class="settings-panel ${flower ? 'with-flower' : ''}"><div class="set-list">${rows}</div>${note}${flower ? `<i class="settings-flower" aria-hidden="true">${stellariaFlower()}</i>` : ''}</div>`;
}

/** A modal's choices, as the settings' rows [direction: every modal as the settings modal: one column, no wordy lines,
 *  no close button when a choice already closes it]. `go`: the choice the modal is for, a little bolder. */
export function choiceRow(act: string, label: string, attrs = '', go = false, sub = ''): string {
  return `<button class="set-row set-link ${go ? 'set-go' : ''}" data-act="${act}" ${attrs}><span class="set-label">${label}${sub ? `<small>${sub}</small>` : ''}</span><i aria-hidden="true">›</i></button>`;
}

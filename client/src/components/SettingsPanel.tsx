/**
 * SettingsPanel.tsx — edit (or view) the game settings.
 *
 * Controlled by the parent: it just calls onChange with the changed field(s).
 * The server validates/clamps everything, so we don't need to be strict here.
 * Used by the host in the lobby and by the Super-Admin (any time).
 */

import { SETTINGS_LIMITS } from "@shared/types";
import type { Settings } from "@shared/types";
import type { SettingsUpdate } from "@shared/events";

interface Props {
  settings: Settings;
  editable: boolean;
  onChange: (update: SettingsUpdate) => void;
}

export function SettingsPanel({ settings, editable, onChange }: Props) {
  if (!editable) {
    return (
      <div className="settings-panel readonly">
        <span>{settings.rounds} rounds</span>
        <span>{settings.drawTime}s draw time</span>
        <span>{settings.wordChoiceCount} word choices</span>
        <span>{settings.hintCount} hints</span>
        {settings.customWordsOnly && <span>custom words only</span>}
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <NumberRow
        label="Rounds"
        value={settings.rounds}
        limit={SETTINGS_LIMITS.rounds}
        onChange={(v) => onChange({ rounds: v })}
      />
      <NumberRow
        label="Draw time (s)"
        value={settings.drawTime}
        limit={SETTINGS_LIMITS.drawTime}
        step={5}
        onChange={(v) => onChange({ drawTime: v })}
      />
      <NumberRow
        label="Word choices"
        value={settings.wordChoiceCount}
        limit={SETTINGS_LIMITS.wordChoiceCount}
        onChange={(v) => onChange({ wordChoiceCount: v })}
      />
      <NumberRow
        label="Hints"
        value={settings.hintCount}
        limit={SETTINGS_LIMITS.hintCount}
        onChange={(v) => onChange({ hintCount: v })}
      />

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.customWordsOnly}
          onChange={(e) => onChange({ customWordsOnly: e.target.checked })}
        />
        Use only custom words
      </label>

      <textarea
        className="custom-words"
        // defaultValue (uncontrolled) so typing isn't interrupted; we save on blur.
        defaultValue={settings.customWords.join(", ")}
        placeholder="Custom family words, comma-separated (e.g. grandpa, our cat, taj mahal)"
        onBlur={(e) => onChange({ customWords: e.target.value })}
      />
    </div>
  );
}

function NumberRow({
  label,
  value,
  limit,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  limit: { min: number; max: number };
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <input
        type="number"
        className="setting-number"
        value={value}
        min={limit.min}
        max={limit.max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

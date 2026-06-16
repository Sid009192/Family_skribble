/**
 * SettingsPanel.tsx — host-editable settings, laid out skribbl-style.
 *
 * Exposes three pieces so different screens can compose them:
 *   - <SettingsGrid />        the 2-column grid of numeric fields
 *   - <CustomWordsSection />  the "Custom words" label + toggle + textarea
 *   - <SettingsPanel />       convenience wrapper that stacks both (used by
 *                              the admin console where they live together).
 *
 * The lobby renders <SettingsGrid /> inside the glass panel and then renders
 * <CustomWordsSection /> as its own full-width strip flush to the edges.
 *
 * The server validates/clamps every change, so this component is permissive.
 */

import { SETTINGS_LIMITS } from "@shared/types";
import type { Settings } from "@shared/types";
import type { SettingsUpdate } from "@shared/events";

interface Props {
  settings: Settings;
  editable: boolean;
  onChange: (update: SettingsUpdate) => void;
}

// Field → icon mapping (filenames in client/public/img/).
const ICONS = {
  players: "setting_players.gif",
  drawtime: "setting_drawtime.gif",
  rounds: "setting_rounds.gif",
  wordcount: "setting_wordcount.gif",
  hints: "setting_hints.gif",
} as const;

export function SettingsGrid({ settings, editable, onChange }: Props) {
  if (!editable) {
    return (
      <div className="settings-panel readonly">
        <span>{settings.maxPlayers} max players</span>
        <span>{settings.rounds} rounds</span>
        <span>{settings.drawTime}s draw time</span>
        <span>{settings.wordChoiceCount} word choices</span>
        <span>{settings.hintCount} hints</span>
      </div>
    );
  }
  return (
    <div className="settings-grid">
      <SettingRow
        icon={ICONS.players}
        label="Players"
        value={settings.maxPlayers}
        limit={SETTINGS_LIMITS.maxPlayers}
        onChange={(v) => onChange({ maxPlayers: v })}
      />
      <SettingRow
        icon={ICONS.rounds}
        label="Rounds"
        value={settings.rounds}
        limit={SETTINGS_LIMITS.rounds}
        onChange={(v) => onChange({ rounds: v })}
      />
      <SettingRow
        icon={ICONS.drawtime}
        label="Drawtime"
        value={settings.drawTime}
        limit={SETTINGS_LIMITS.drawTime}
        step={5}
        onChange={(v) => onChange({ drawTime: v })}
      />
      <SettingRow
        icon={ICONS.wordcount}
        label="Word Count"
        value={settings.wordChoiceCount}
        limit={SETTINGS_LIMITS.wordChoiceCount}
        onChange={(v) => onChange({ wordChoiceCount: v })}
      />
      <SettingRow
        icon={ICONS.hints}
        label="Hints"
        value={settings.hintCount}
        limit={SETTINGS_LIMITS.hintCount}
        onChange={(v) => onChange({ hintCount: v })}
      />
    </div>
  );
}

export function CustomWordsSection({ settings, editable, onChange }: Props) {
  if (!editable) return null;
  return (
    <div className="custom-words-section">
      <div className="custom-words-head">
        <span className="custom-words-label">Custom words</span>
        <label className="custom-only-toggle">
          <input
            type="checkbox"
            checked={settings.customWordsOnly}
            onChange={(e) => onChange({ customWordsOnly: e.target.checked })}
          />
          Use custom words only
        </label>
      </div>
      <textarea
        className="custom-words"
        // Uncontrolled so typing isn't interrupted; we save on blur.
        defaultValue={settings.customWords.join(", ")}
        placeholder="Minimum of 10 words. 1-32 characters per word! Separated by a , (comma)"
        onBlur={(e) => onChange({ customWords: e.target.value })}
      />
    </div>
  );
}

/** Stack both sections together (used by the admin modal). */
export function SettingsPanel(props: Props) {
  return (
    <>
      <SettingsGrid {...props} />
      <CustomWordsSection {...props} />
    </>
  );
}

function SettingRow({
  icon,
  label,
  value,
  limit,
  step = 1,
  onChange,
}: {
  icon: string;
  label: string;
  value: number;
  limit: { min: number; max: number };
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="setting-row">
      <img className="setting-icon" src={`/img/${icon}`} alt="" />
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

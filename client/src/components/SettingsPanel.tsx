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

import { useEffect, useState } from "react";
import { DIFFICULTIES, SETTINGS_LIMITS } from "@shared/types";
import type { Difficulty, Settings } from "@shared/types";
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
  // Same 2-col grid for both roles. Non-host inputs are just `disabled` so
  // they see exactly what the host sees, can't change anything (the server
  // also enforces this — see `updateSettings` permission check).
  const noop = () => {};
  return (
    <div className="settings-grid">
      <SettingRow
        icon={ICONS.players}
        label="Players"
        value={settings.maxPlayers}
        limit={SETTINGS_LIMITS.maxPlayers}
        disabled={!editable}
        onChange={editable ? (v) => onChange({ maxPlayers: v }) : noop}
      />
      <SettingRow
        icon={ICONS.rounds}
        label="Rounds"
        value={settings.rounds}
        limit={SETTINGS_LIMITS.rounds}
        disabled={!editable}
        onChange={editable ? (v) => onChange({ rounds: v }) : noop}
      />
      <SettingRow
        icon={ICONS.drawtime}
        label="Drawtime"
        value={settings.drawTime}
        limit={SETTINGS_LIMITS.drawTime}
        step={5}
        disabled={!editable}
        onChange={editable ? (v) => onChange({ drawTime: v }) : noop}
      />
      <SettingRow
        icon={ICONS.wordcount}
        label="Word Count"
        value={settings.wordChoiceCount}
        limit={SETTINGS_LIMITS.wordChoiceCount}
        disabled={!editable}
        onChange={editable ? (v) => onChange({ wordChoiceCount: v }) : noop}
      />
      <SettingRow
        icon={ICONS.hints}
        label="Hints"
        value={settings.hintCount}
        limit={SETTINGS_LIMITS.hintCount}
        disabled={!editable}
        onChange={editable ? (v) => onChange({ hintCount: v }) : noop}
      />
      <DifficultyRow
        value={settings.difficulty}
        disabled={!editable}
        onChange={editable ? (v) => onChange({ difficulty: v }) : noop}
      />
    </div>
  );
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  mix: "Mix",
};

function DifficultyRow({
  value,
  disabled,
  onChange,
}: {
  value: Difficulty;
  disabled: boolean;
  onChange: (v: Difficulty) => void;
}) {
  return (
    <div className="difficulty-row">
      <span className="setting-label">Difficulty</span>
      <div className="difficulty-options">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            className={`difficulty-btn${d === value ? " selected" : ""}`}
            disabled={disabled}
            onClick={() => onChange(d)}
          >
            {DIFFICULTY_LABELS[d]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CustomWordsSection({ settings, editable, onChange }: Props) {
  // Shown to host AND non-host (per user — same layout). For non-host, the
  // checkbox + textarea are disabled so it's view-only.
  return (
    <div className="custom-words-section">
      <div className="custom-words-head">
        <span className="custom-words-label">Custom words</span>
        <label className="custom-only-toggle">
          <input
            type="checkbox"
            checked={settings.customWordsOnly}
            disabled={!editable}
            onChange={(e) =>
              editable && onChange({ customWordsOnly: e.target.checked })
            }
          />
          Use custom words only
        </label>
      </div>
      <textarea
        className="custom-words"
        // `key` forces React to remount the textarea when the list changes
        // server-side, picking up the new defaultValue.
        key={settings.customWords.join(",")}
        defaultValue={settings.customWords.join(", ")}
        placeholder="Minimum of 10 words. 1-32 characters per word! Separated by a , (comma)"
        disabled={!editable}
        onBlur={(e) => editable && onChange({ customWords: e.target.value })}
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
  disabled = false,
  onChange,
}: {
  icon: string;
  label: string;
  value: number;
  limit: { min: number; max: number };
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  // The field edits its OWN text while focused, so the user can freely clear
  // it and retype (mobile keypads especially — no arrow buttons to fall back
  // on). We only clamp + push the change up once they're done editing
  // (blur / Enter), instead of on every keystroke, so a mid-typing empty
  // field doesn't get instantly overwritten by the server's clamped value.
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Pick up server-confirmed changes (ours or another admin's) — but only
  // while we're not actively editing, so we never clobber in-progress typing.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  function commit() {
    setFocused(false);
    const n = Number(draft.trim());
    if (draft.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(value)); // nothing usable typed — revert, no change sent
      return;
    }
    const clamped = Math.min(limit.max, Math.max(limit.min, Math.round(n)));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <div className="setting-row">
      <img className="setting-icon" src={`/img/${icon}`} alt="" />
      <span className="setting-label">{label}</span>
      <input
        type="number"
        className="setting-number"
        value={draft}
        min={limit.min}
        max={limit.max}
        step={step}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

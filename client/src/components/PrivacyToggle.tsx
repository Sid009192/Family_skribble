/**
 * PrivacyToggle.tsx — a slim sliding pill for Private ↔ Public.
 *
 * The whole pill is one button. There's a single coloured thumb that slides
 * left or right. The active label lives *inside* the thumb (green "Private"
 * on the left; orange "Public" on the right). The other side shows a dim
 * placeholder so the user knows what they'll get if they tap. Subtle, fits
 * the theme, and one tap to switch.
 */

interface Props {
  value: "private" | "public";
  onChange: (next: "private" | "public") => void;
}

export function PrivacyToggle({ value, onChange }: Props) {
  const flip = () => onChange(value === "private" ? "public" : "private");
  return (
    <button
      type="button"
      className={`privacy-slider ${value}`}
      onClick={flip}
      aria-label={`room is ${value} — tap to switch`}
      title={value === "private" ? "Private — tap for Public" : "Public — tap for Private"}
    >
      <span className="ps-ghost ps-left">Private</span>
      <span className="ps-ghost ps-right">Public</span>
      <span className="ps-thumb">{value === "private" ? "🔒 Private" : "🌐 Public"}</span>
    </button>
  );
}

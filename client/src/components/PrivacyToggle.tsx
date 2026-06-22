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
      aria-label={`Room is ${value}. Tap to switch.`}
      title={value === "private" ? "Private. Tap for Public" : "Public. Tap for Private"}
    >
      <span className="ps-label ps-label-private">PRIVATE</span>
      <span className="ps-label ps-label-public">PUBLIC</span>
      <span className="ps-thumb">{value === "private" ? "PRIVATE" : "PUBLIC"}</span>
    </button>
  );
}

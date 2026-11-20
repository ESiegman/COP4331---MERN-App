import { useId } from "react";

interface Props {
  value: string;
  onChange: (text: string) => void;
  // Only items with a picture need a description. Text-only items show nothing.
  hasPicture: boolean;
  disabled?: boolean;
}

// The description of an item's picture, read aloud by screen readers. Required whenever the item
// has a picture; an item with no picture is text only and doesn't need one.
function AltTextField({ value, onChange, hasPicture, disabled = false }: Props) {
  const id = useId();
  const helpId = useId();
  if (!hasPicture) return null;

  return (
    <div className="mt-2">
      <label htmlFor={id} className="form-label fw-semibold">
        Describe the picture <span className="text-danger">(required)</span>
      </label>
      <input
        id={id}
        className="form-control"
        maxLength={200}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
        aria-describedby={helpId}
      />
      <div id={helpId} className="form-text">
        Say what the picture shows, for people who can't see it. For example: “A red can of soda”. You can also remove the picture to make this a text-only item.
      </div>
    </div>
  );
}

export default AltTextField;

import { useId, useRef, useState, type ChangeEvent } from "react";
import { uploadImage, ACCEPTED_IMAGE_TYPES, type UploadKind } from "../utils/upload";

interface Props {
  label: string;
  kind: UploadKind;
  // The picture's link: either pasted or filled in by an upload
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  help?: string;
}

// A picture field: paste a link, or press Upload to choose a file. In the Android app, Upload
// opens the phone's gallery or camera, because the WebView shows its file chooser.
function ImageField({ label, kind, value, onChange, disabled = false, help }: Props) {
  const inputId = useId();
  const helpId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear the box so choosing the same file again still fires onChange
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError("");
    const result = await uploadImage(file, kind);
    setUploading(false);
    if (result.ok) onChange(result.url);
    else setError(result.error);
  }

  return (
    <div>
      <label htmlFor={inputId} className="form-label fw-semibold">{label}</label>
      <div className="input-group">
        <input
          id={inputId}
          type="url"
          className="form-control"
          placeholder="https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || uploading}
          aria-describedby={helpId}
        />
        <button type="button" className="btn btn-outline-secondary" onClick={() => fileInput.current?.click()} disabled={disabled || uploading}>
          <i className="bi bi-upload me-1" aria-hidden="true"></i>
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {value && !uploading && (
          <button type="button" className="btn btn-outline-secondary" onClick={() => onChange("")} disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`}>
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        )}
        <input ref={fileInput} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="d-none" onChange={(e) => void onFile(e)} tabIndex={-1} aria-hidden="true" />
      </div>
      <div id={helpId} className="form-text">
        {help ?? "Paste a link or upload a JPEG, PNG or WebP picture up to 5 MB."}
      </div>
      {error && <div className="text-danger small mt-1" role="alert">{error}</div>}
      {value && /^https?:\/\//i.test(value) && (
        <img src={value} alt="" className="mt-2 rounded border" style={{ maxHeight: 64, maxWidth: "100%" }} />
      )}
    </div>
  );
}

export default ImageField;

import { useEffect, useId, useRef, useState } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  // Shows a box for an optional reason (a moderator removing content or banning someone)
  askReason?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

// A Bootstrap-styled confirmation dialog, used instead of the browser's window.confirm.
// Escape or a click outside cancels. Focus starts on Cancel so Enter never deletes by accident,
// and goes back to the button that opened the dialog when it closes.
function ConfirmDialog({ title, message, confirmLabel = "Delete", askReason = false, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const messageId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    document.body.classList.add("modal-open");

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
      opener?.focus();
    };
  }, [onCancel]);

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header border-0 pb-0">
              <h2 className="modal-title h5" id={titleId}>{title}</h2>
            </div>
            <div className="modal-body">
              <p id={messageId} className={askReason ? "mb-3" : "mb-0"}>{message}</p>
              {askReason && (
                <>
                  <label htmlFor={reasonId} className="form-label fw-semibold">Reason (optional)</label>
                  <textarea
                    id={reasonId}
                    className="form-control"
                    rows={2}
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="form-text">The owner of the content, or the person banned, is shown this.</div>
                </>
              )}
            </div>
            <div className="modal-footer border-0 pt-0">
              <button type="button" ref={cancelRef} className="btn btn-outline-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => onConfirm(reason.trim())}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ConfirmDialog;

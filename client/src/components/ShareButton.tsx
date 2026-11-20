import { useEffect, useRef, useState } from "react";
import type { Board } from "../utils/board";
import { blobToDataUrl, postToApp } from "../utils/nativeApp";
import { imageFileName, renderBoardImage } from "../utils/shareImage";
import type { Item } from "../utils/types";

export interface ShareImage {
  title: string;
  board: Board;
  items: Item[];
}

// Share a page. With `image` it is a small menu: copy the link to the page, or share a picture of
// the tier list itself. Without it, it just copies the link (the API's share URL already points
// at this web app's own route).
function ShareButton({ url, image }: { url: string; image?: ShareImage }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close the menu on Escape or a click elsewhere
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // pointerdown, not mousedown: iOS Safari sends no mouse events for a tap on a plain page area,
    // so the menu would never close on an outside tap
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  function flash(text: string) {
    setStatus(text);
    window.setTimeout(() => setStatus(""), 2500);
  }

  async function copy() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      // Clipboard access can be blocked: fall back to a prompt the user can copy from
      window.prompt("Copy this link", url);
    }
  }

  function download(blob: Blob, fileName: string) {
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    flash("Image saved");
  }

  async function shareImage() {
    if (!image) return;
    setOpen(false);
    setBusy(true);
    try {
      const blob = await renderBoardImage(image.title, image.board, image.items);
      const file = new File([blob], imageFileName(image.title), { type: "image/png" });
      // Inside the Android app the WebView has no share sheet and ignores downloads of blobs,
      // so the app does the sharing
      if (postToApp({ type: "share-image", fileName: file.name, dataUrl: await blobToDataUrl(blob), title: image.title })) {
        return;
      }
      // On phones this opens the share sheet. Elsewhere the picture is downloaded.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: image.title });
          flash("Image shared");
        } catch (err) {
          // Closing the share sheet is not an error
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Safari only allows sharing shortly after the tap, and drawing the picture can take longer.
          // Save it instead of failing.
          if (err instanceof DOMException && err.name === "NotAllowedError") download(blob, file.name);
          else throw err;
        }
      } else {
        download(blob, file.name);
      }
    } catch {
      flash("Couldn't make the image");
    } finally {
      setBusy(false);
    }
  }

  if (!image) {
    return (
      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void copy()}>
        <i className={`bi ${status ? "bi-check2" : "bi-link-45deg"} me-1`} aria-hidden="true"></i>
        <span aria-live="polite">{status || "Copy link"}</span>
      </button>
    );
  }

  return (
    <div className="position-relative d-inline-block" ref={root}>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        <i className={`bi ${status ? "bi-check2" : "bi-share"} me-1`} aria-hidden="true"></i>
        <span aria-live="polite">{busy ? "Making image…" : status || "Share"}</span>
      </button>
      {open && (
        <div className="dropdown-menu show share-menu" role="menu">
          <button type="button" className="dropdown-item" role="menuitem" onClick={() => void copy()}>
            <i className="bi bi-link-45deg me-2" aria-hidden="true"></i>Copy link to this page
          </button>
          <button type="button" className="dropdown-item" role="menuitem" onClick={() => void shareImage()}>
            <i className="bi bi-image me-2" aria-hidden="true"></i>Share as image
          </button>
        </div>
      )}
    </div>
  );
}

export default ShareButton;

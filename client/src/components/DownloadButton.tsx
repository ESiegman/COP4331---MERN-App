import { useState } from "react";
import { blobToDataUrl, postToApp } from "../utils/nativeApp";
import { imageFileName, renderBoardImage } from "../utils/shareImage";
import type { ShareImage } from "./ShareButton";

// Saves the tier list as a PNG. Unlike "Share as image" it never opens a share sheet: the file
// always goes to the Downloads folder. The picture is drawn in the browser, nothing is uploaded.
function DownloadButton({ image }: { image: ShareImage }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  function flash(text: string) {
    setStatus(text);
    window.setTimeout(() => setStatus(""), 2500);
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await renderBoardImage(image.title, image.board, image.items);
      const fileName = imageFileName(image.title);

      // The Android app's WebView ignores downloads of blobs, so the app saves it (its share
      // sheet has a save option)
      if (postToApp({ type: "share-image", fileName, dataUrl: await blobToDataUrl(blob), title: image.title })) {
        return;
      }

      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      flash("Image saved");
    } catch {
      flash("Couldn't make the image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void download()} disabled={busy}>
      <i className={`bi ${status === "Image saved" ? "bi-check2" : "bi-download"} me-1`} aria-hidden="true"></i>
      <span aria-live="polite">{busy ? "Making image…" : status || "Download"}</span>
    </button>
  );
}

export default DownloadButton;

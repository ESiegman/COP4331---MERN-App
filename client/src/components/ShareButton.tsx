import { useState } from "react";

// Copies the link the API gave back (it already points at this web app's own route)
function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked: fall back to a prompt the user can copy from
      window.prompt("Copy this link", url);
    }
  }

  return (
    <button type="button" className="btn btn-sm btn-outline-primary" onClick={copy}>
      <i className={`bi ${copied ? "bi-check2" : "bi-link-45deg"} me-1`} aria-hidden="true"></i>
      <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
}

export default ShareButton;

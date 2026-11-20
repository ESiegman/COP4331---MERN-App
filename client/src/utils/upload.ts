import { apiFetch } from "./api";

// Uploading a picture takes three steps (see POST /api/uploads/sign in server/README.md):
// ask for a ticket, PUT the file to the ticket's uploadUrl, then save the ticket's url on the
// avatar, item or template like any pasted link.

export type UploadKind = "item" | "avatar" | "cover";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface UploadTicket {
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
  url: string;
}

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadImage(file: File, kind: UploadKind): Promise<UploadResult> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Choose a JPEG, PNG or WebP picture." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "That picture is over 5 MB. Choose a smaller one." };
  }

  const ticket = await apiFetch<UploadTicket>("api/uploads/sign", {
    method: "POST",
    body: { kind, contentType: file.type },
  });
  if (!ticket.ok) return { ok: false, error: ticket.error ?? "Could not start the upload" };

  // The ticket is the permission, so no login token goes with this request
  let response: Response;
  try {
    response = await fetch(ticket.data.uploadUrl, {
      method: ticket.data.method,
      headers: ticket.data.headers,
      body: file,
    });
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 413) return { ok: false, error: "That picture is over 5 MB. Choose a smaller one." };
    return { ok: false, error: body?.error ?? `The upload failed (${response.status})` };
  }

  return { ok: true, url: ticket.data.url };
}

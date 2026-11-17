import { useCallback, useRef, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

// A drop-in replacement for window.confirm:
//
//   const { confirm, dialog } = useConfirm();
//   if (!(await confirm({ title: "Delete?", message: "...", confirmLabel: "Delete" }))) return;
//   ...
//   return <main>... {dialog}</main>;
//
// Put {dialog} anywhere in the component's returned JSX.
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        current.current?.resolve(false); // a dialog is already open: treat it as cancelled
        const next = { ...options, resolve };
        current.current = next;
        setPending(next);
      }),
    []
  );

  const answer = useCallback((ok: boolean) => {
    current.current?.resolve(ok);
    current.current = null;
    setPending(null);
  }, []);
  const cancel = useCallback(() => answer(false), [answer]);
  const accept = useCallback(() => answer(true), [answer]);

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      onConfirm={accept}
      onCancel={cancel}
    />
  ) : null;

  return { confirm, dialog };
}

import { useCallback, useRef, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

interface Answer {
  ok: boolean;
  reason: string;
}

interface Pending extends ConfirmOptions {
  askReason: boolean;
  resolve: (answer: Answer) => void;
}

// A drop-in replacement for window.confirm:
//
//   const { confirm, dialog } = useConfirm();
//   if (!(await confirm({ title: "Delete?", message: "...", confirmLabel: "Delete" }))) return;
//   ...
//   return <main>... {dialog}</main>;
//
// Put {dialog} anywhere in the component's returned JSX.
//
// confirmWithReason is the same dialog with a box for an optional reason. It answers null when
// cancelled, and otherwise the reason (an empty string when none was typed).
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);

  const ask = useCallback(
    (options: ConfirmOptions, askReason: boolean) =>
      new Promise<Answer>((resolve) => {
        current.current?.resolve({ ok: false, reason: "" }); // a dialog is already open: treat it as cancelled
        const next = { ...options, askReason, resolve };
        current.current = next;
        setPending(next);
      }),
    []
  );

  const confirm = useCallback(async (options: ConfirmOptions) => (await ask(options, false)).ok, [ask]);
  const confirmWithReason = useCallback(
    async (options: ConfirmOptions) => {
      const answer = await ask(options, true);
      return answer.ok ? answer.reason : null;
    },
    [ask]
  );

  const answer = useCallback((ok: boolean, reason: string) => {
    current.current?.resolve({ ok, reason });
    current.current = null;
    setPending(null);
  }, []);
  const cancel = useCallback(() => answer(false, ""), [answer]);
  const accept = useCallback((reason: string) => answer(true, reason), [answer]);

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      askReason={pending.askReason}
      onConfirm={accept}
      onCancel={cancel}
    />
  ) : null;

  return { confirm, confirmWithReason, dialog };
}

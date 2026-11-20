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
  password: string;
}

interface Pending extends ConfirmOptions {
  askReason: boolean;
  askPassword: boolean;
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
//
// confirmWithPassword is the same dialog with a password box. It answers null when cancelled,
// and otherwise the password that was typed (never empty).
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);

  const ask = useCallback(
    (options: ConfirmOptions, extras: { askReason?: boolean; askPassword?: boolean } = {}) =>
      new Promise<Answer>((resolve) => {
        current.current?.resolve({ ok: false, reason: "", password: "" }); // a dialog is already open: treat it as cancelled
        const next = { ...options, askReason: extras.askReason ?? false, askPassword: extras.askPassword ?? false, resolve };
        current.current = next;
        setPending(next);
      }),
    []
  );

  const confirm = useCallback(async (options: ConfirmOptions) => (await ask(options)).ok, [ask]);
  const confirmWithReason = useCallback(
    async (options: ConfirmOptions) => {
      const answer = await ask(options, { askReason: true });
      return answer.ok ? answer.reason : null;
    },
    [ask]
  );
  const confirmWithPassword = useCallback(
    async (options: ConfirmOptions) => {
      const answer = await ask(options, { askPassword: true });
      return answer.ok ? answer.password : null;
    },
    [ask]
  );

  const answer = useCallback((ok: boolean, reason: string, password: string) => {
    current.current?.resolve({ ok, reason, password });
    current.current = null;
    setPending(null);
  }, []);
  const cancel = useCallback(() => answer(false, "", ""), [answer]);
  const accept = useCallback((reason: string, password: string) => answer(true, reason, password), [answer]);

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      askReason={pending.askReason}
      askPassword={pending.askPassword}
      onConfirm={accept}
      onCancel={cancel}
    />
  ) : null;

  return { confirm, confirmWithReason, confirmWithPassword, dialog };
}

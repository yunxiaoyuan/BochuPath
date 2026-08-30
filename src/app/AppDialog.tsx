import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogApi {
  confirm(options: ConfirmOptions): Promise<boolean>;
  prompt(options: PromptOptions): Promise<string | null>;
}

type DialogState =
  | ({ kind: "confirm" } & ConfirmOptions)
  | ({ kind: "prompt"; value: string } & PromptOptions)
  | null;
type DialogResult = boolean | string | null;

const DialogContext = createContext<DialogApi | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const resolver = useRef<((result: DialogResult) => void) | null>(null);
  const titleId = useId();
  const messageId = useId();

  const finish = useCallback((result: DialogResult) => {
    const resolve = resolver.current;
    resolver.current = null;
    setDialog(null);
    resolve?.(result);
  }, []);

  const api = useMemo<DialogApi>(() => ({
    confirm: (options) => new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = (result) => resolve(result === true);
      setDialog({ kind: "confirm", ...options });
    }),
    prompt: (options) => new Promise<string | null>((resolve) => {
      resolver.current?.(null);
      resolver.current = (result) => resolve(typeof result === "string" ? result : null);
      setDialog({ kind: "prompt", value: options.defaultValue ?? "", ...options });
    }),
  }), []);

  const cancel = () => finish(dialog?.kind === "confirm" ? false : null);
  const confirm = () => {
    if (!dialog) return;
    if (dialog.kind === "confirm") finish(true);
    else if (dialog.value.trim()) finish(dialog.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      confirm();
    }
  };
  const destructive = dialog?.kind === "confirm" && dialog.destructive;

  return <DialogContext.Provider value={api}>
    {children}
    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={cancel}>
      <section
        className="modal-card app-dialog-card"
        role={destructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={dialog.message ? messageId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{dialog.title}</h2>
        {dialog.message && <p id={messageId}>{dialog.message}</p>}
        {dialog.kind === "prompt" && <label className="field">
          <span>{dialog.label}</span>
          <input
            autoFocus
            value={dialog.value}
            onChange={(event) => setDialog({ ...dialog, value: event.target.value })}
          />
        </label>}
        <div className="modal-actions">
          <button type="button" onClick={cancel}>{dialog.cancelLabel ?? "取消"}</button>
          <button
            type="button"
            autoFocus={dialog.kind === "confirm"}
            className={destructive ? "danger-button" : "primary-button"}
            disabled={dialog.kind === "prompt" && !dialog.value.trim()}
            onClick={confirm}
          >
            {dialog.confirmLabel ?? "确定"}
          </button>
        </div>
      </section>
    </div>}
  </DialogContext.Provider>;
}

export function useAppDialog(): DialogApi {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useAppDialog must be used inside AppDialogProvider");
  return value;
}

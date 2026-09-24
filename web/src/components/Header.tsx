import type { PrinterStatus } from "../types";

interface HeaderProps {
  printer: PrinterStatus | null;
  error: string | null;
}

export function Header({ printer, error }: HeaderProps) {
  const state = error ? "error" : (printer?.status ?? "unknown");
  const label = error ?? (printer ? `${printer.name} · ${printer.message}` : "Checking printer…");

  return (
    <header className="header">
      <div className="header__titles">
        <h1 className="header__title">FedPrint</h1>
        <p className="header__subtitle">Local network printing</p>
      </div>
      <div className={`status status--${state}`} role="status" aria-live="polite">
        <span className="status__dot" aria-hidden="true" />
        <span className="status__label">{label}</span>
      </div>
    </header>
  );
}

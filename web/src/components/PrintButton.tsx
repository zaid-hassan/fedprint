interface PrintButtonProps {
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}

export function PrintButton({ disabled, busy, onClick }: PrintButtonProps) {
  return (
    <button className="print-button" type="button" disabled={disabled || busy} onClick={onClick}>
      {busy ? "Sending…" : "Print"}
    </button>
  );
}

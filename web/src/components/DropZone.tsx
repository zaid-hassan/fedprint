import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { MAX_UPLOAD_MB } from "../utils";

interface DropZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain";

export function DropZone({ onFile, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(): void {
    if (!disabled) inputRef.current?.click();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick();
    }
  }

  const classes = ["dropzone"];
  if (dragging) classes.push("dropzone--active");
  if (disabled) classes.push("dropzone--disabled");

  return (
    <div
      className={classes.join(" ")}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={pick}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="dropzone__icon" aria-hidden="true">
        📄
      </div>
      <p className="dropzone__text">Drop a file here or choose a file</p>
      <p className="dropzone__hint">PDF, PNG, JPG, or TXT · up to {MAX_UPLOAD_MB} MB</p>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={handleChange} />
    </div>
  );
}

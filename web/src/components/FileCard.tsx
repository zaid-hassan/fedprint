import { extensionOf, formatBytes } from "../utils";

interface FileCardProps {
  file: File;
  pages?: number | undefined;
  onRemove: () => void;
}

export function FileCard({ file, pages, onRemove }: FileCardProps) {
  const type = extensionOf(file.name).replace(".", "").toUpperCase() || "FILE";
  const pageText = pages && pages > 0 ? ` · ${pages} page${pages > 1 ? "s" : ""}` : "";

  return (
    <div className="filecard">
      <div className="filecard__info">
        <span className="filecard__name" title={file.name}>
          {file.name}
        </span>
        <span className="filecard__meta">
          {formatBytes(file.size)} · {type}
          {pageText}
        </span>
      </div>
      <button className="filecard__remove" type="button" onClick={onRemove} aria-label="Remove file">
        ×
      </button>
    </div>
  );
}

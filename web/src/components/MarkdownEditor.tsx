import { useMemo, useState } from "react";
import { renderMarkdownHtml } from "../utils";

interface MarkdownEditorProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const PLACEHOLDER = `# Title

Write your document…

- point one
- point two

**Bold**, *italic*, and \`code\`.`;

export function MarkdownEditor({ value, disabled = false, onChange }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);
  const html = useMemo(() => (preview ? renderMarkdownHtml(value) : ""), [preview, value]);

  return (
    <div className="md">
      <div className="md__bar">
        <span className="md__label">Document</span>
        <button
          className="md__switch"
          type="button"
          onClick={() => setPreview((current) => !current)}
          aria-pressed={preview}
        >
          {preview ? "Edit" : "Preview"}
        </button>
      </div>

      {preview ? (
        html.length > 0 ? (
          <div className="md__preview markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="md__preview md__preview--empty">Nothing to preview yet.</div>
        )
      ) : (
        <textarea
          className="md__input"
          value={value}
          placeholder={PLACEHOLDER}
          disabled={disabled}
          spellCheck
          rows={12}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

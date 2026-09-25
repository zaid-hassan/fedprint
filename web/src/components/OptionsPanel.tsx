import type { ColorMode, Orientation, PrintOptions, PrinterCapabilities, SidesMode } from "../types";

interface OptionsPanelProps {
  options: PrintOptions;
  capabilities: PrinterCapabilities;
  disabled?: boolean;
  showPageRange?: boolean;
  onChange: (patch: Partial<PrintOptions>) => void;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  choices: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ label, value, choices, disabled, onChange }: SegmentedProps<T>) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className={`segmented__item${value === choice.value ? " segmented__item--active" : ""}`}
            aria-pressed={value === choice.value}
            disabled={disabled}
            onClick={() => onChange(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OptionsPanel({ options, capabilities, disabled = false, showPageRange = true, onChange }: OptionsPanelProps) {
  const copyMin = 1;
  const copyMax = 20;

  const colorChoices: { value: ColorMode; label: string }[] = [
    { value: "color", label: "Color" },
    { value: "grayscale", label: "Grayscale" },
  ];
  const showGrayscale = capabilities.colors.includes("grayscale");

  const duplexChoices: { value: SidesMode; label: string }[] = [
    { value: "one-sided", label: "Off" },
    { value: "two-sided-long-edge", label: "Long edge" },
    { value: "two-sided-short-edge", label: "Short edge" },
  ];

  return (
    <section className="options" aria-label="Print options">
      <div className="field">
        <span className="field__label">Copies</span>
        <div className="stepper">
          <button
            type="button"
            className="stepper__button"
            aria-label="Fewer copies"
            disabled={disabled || options.copies <= copyMin}
            onClick={() => onChange({ copies: Math.max(copyMin, options.copies - 1) })}
          >
            −
          </button>
          <input
            className="stepper__value"
            type="number"
            inputMode="numeric"
            min={copyMin}
            max={copyMax}
            value={options.copies}
            disabled={disabled}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (Number.isNaN(next)) return;
              onChange({ copies: Math.min(copyMax, Math.max(copyMin, next)) });
            }}
          />
          <button
            type="button"
            className="stepper__button"
            aria-label="More copies"
            disabled={disabled || options.copies >= copyMax}
            onClick={() => onChange({ copies: Math.min(copyMax, options.copies + 1) })}
          >
            +
          </button>
        </div>
      </div>

      {showPageRange ? (
        <div className="field">
          <label className="field__label" htmlFor="page-range">
            Page range
          </label>
          <input
            id="page-range"
            className="text-input"
            type="text"
            inputMode="text"
            placeholder="All"
            value={options.pages}
            disabled={disabled}
            onChange={(event) => onChange({ pages: event.target.value })}
          />
        </div>
      ) : null}

      <Segmented<Orientation>
        label="Orientation"
        value={options.orientation}
        disabled={disabled}
        choices={[
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ]}
        onChange={(value) => onChange({ orientation: value })}
      />

      <Segmented<string>
        label="Paper"
        value={options.media}
        disabled={disabled}
        choices={capabilities.pageSizes.map((size) => ({ value: size, label: size }))}
        onChange={(value) => onChange({ media: value })}
      />

      {showGrayscale ? (
        <Segmented<ColorMode>
          label="Color"
          value={options.color}
          disabled={disabled}
          choices={colorChoices}
          onChange={(value) => onChange({ color: value })}
        />
      ) : null}

      {capabilities.duplex ? (
        <Segmented<SidesMode>
          label="Duplex"
          value={options.sides}
          disabled={disabled}
          choices={duplexChoices}
          onChange={(value) => onChange({ sides: value })}
        />
      ) : null}
    </section>
  );
}

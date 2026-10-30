import { useState } from "react";
import type { Language } from "../i18n";
import { inLanguage } from "../localize";
export function ExpenseChoice({
  name,
  label,
  values,
  initial = "",
  required = false,
  readOnly = false,
  onValue,
  onAdd,
  language,
  maxLength,
}: Readonly<{
  name: string;
  label: string;
  values: string[];
  initial?: string;
  required?: boolean;
  readOnly?: boolean;
  onValue?: (value: string) => void;
  onAdd: (value: string) => void;
  language: Language;
  maxLength: number;
}>) {
  const [value, setValue] = useState(initial),
    [open, setOpen] = useState(false);
  const options = [...new Set(values)]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const matching = options.filter((option) =>
    option.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
  );
  function change(next: string) {
    setValue(next);
    onValue?.(next);
  }
  function add() {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const existing = options.find(
      (o) => o.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    change(existing ?? trimmed);
    onAdd(existing ?? trimmed);
    setOpen(false);
  }
  const addLabel = inLanguage(
    language,
    `＋ নতুন ${label} যোগ করুন`,
    `＋ ${label} जोड़ें`,
    `＋ Add ${label}`,
  );
  return (
    <div className="expense-choice" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
      <label>
        <span>{label}</span>
        <input
          name={name}
          value={value}
          required={required}
          maxLength={maxLength}
          readOnly={readOnly}
          onFocus={() => {
            if (!readOnly) setOpen(true);
          }}
          onChange={(e) => {
            change(e.target.value);
            setOpen(true);
          }}
          autoComplete="off"
        />
      </label>
      {!readOnly && (
        <button
          type="button"
          className="expense-choice-toggle" aria-label={`${inLanguage(language,"বেছে নিন","चुनें","Choose")} ${label}`} aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      )}
      {open && !readOnly && (
        <div className="expense-options">
          <button type="button" onClick={add} disabled={!value.trim()}>
            {addLabel}: {value.trim()}
          </button>
          {matching.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                change(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

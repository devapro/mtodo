import { useMemo, useRef, useState } from 'react';
import { Badge, Form } from 'react-bootstrap';

interface Props {
  value: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

export default function TagInput({ value, suggestions, onChange }: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const lower = value.map((v) => v.toLowerCase());
  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter((s) => !lower.includes(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [input, suggestions, lower]);

  const canCreate =
    input.trim().length > 0 &&
    !suggestions.some((s) => s.toLowerCase() === input.trim().toLowerCase()) &&
    !lower.includes(input.trim().toLowerCase());

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    if (!lower.includes(t.toLowerCase())) onChange([...value, t]);
    setInput('');
    setOpen(false);
  };

  const removeTag = (tag: string) => onChange(value.filter((v) => v !== tag));

  return (
    <div className="tag-input position-relative" ref={wrapperRef}>
      <div className="d-flex flex-wrap gap-1 mb-1">
        {value.map((t) => (
          <Badge
            key={t}
            bg="primary"
            className="tag-chip d-flex align-items-center gap-1"
            role="button"
            onClick={() => removeTag(t)}
            title="Click to remove"
          >
            {t} <span aria-hidden>×</span>
          </Badge>
        ))}
      </div>
      <Form.Control
        type="text"
        value={input}
        placeholder="Type to search or add a tag…"
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (input.trim()) addTag(input);
          } else if (e.key === 'Backspace' && !input && value.length) {
            removeTag(value[value.length - 1]);
          }
        }}
      />
      {open && (filtered.length > 0 || canCreate) && (
        <div className="dropdown-menu show mt-1">
          {filtered.map((s) => (
            <button
              type="button"
              key={s}
              className="dropdown-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(s)}
            >
              {s}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className="dropdown-item text-primary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(input)}
            >
              + Create “{input.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

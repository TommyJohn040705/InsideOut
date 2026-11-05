import { useState } from 'react';
import { searchPlaces } from '../lib/routing';
import type { Building } from '../lib/types';

interface Props {
  building: Building;
  label: string;
  value?: string;
  placeholder: string;
  onChange: (nodeId: string | undefined) => void;
}

export function PlacePicker({ building, label, value, placeholder, onChange }: Props) {
  const selected = value ? building.nodes.find((n) => n.id === value) : undefined;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = searchPlaces(building, query);
  const floorName = (id: string) => building.floors.find((f) => f.id === id)?.name ?? '';

  return (
    <div className="picker">
      <label>{label}</label>
      <input
        type="search"
        value={open ? query : selected?.label ?? ''}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            onChange(results[0].id);
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={label}
      />
      {selected && !open && (
        <button className="clear" onClick={() => onChange(undefined)} aria-label={`Clear ${label}`}>
          x
        </button>
      )}
      {open && results.length > 0 && (
        <ul className="results" role="listbox">
          {results.map((n) => (
            <li
              key={n.id}
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(n.id);
                setOpen(false);
                (document.activeElement as HTMLElement | null)?.blur();
              }}
            >
              <span>{n.label}</span>
              <small>{floorName(n.floorId)}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";

/** Typing stays local and urgent; the parent list updates in an interruptible transition. */
export function EventSearch({ initialValue, placeholder, onSearch }: {
  initialValue: string;
  placeholder: string;
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  return <input
    type="search"
    value={value}
    placeholder={placeholder}
    aria-busy={pending}
    onChange={(event) => {
      const next = event.target.value;
      setValue(next);
      startTransition(() => onSearch(next));
    }}
  />;
}

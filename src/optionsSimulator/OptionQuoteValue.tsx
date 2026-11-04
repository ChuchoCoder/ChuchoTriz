import { useEffect, useRef, useState } from "react";
import { formatOptionNumber } from "./format";

/** A change is relative to the last displayed value, never to an exchange timestamp. */
export function OptionQuoteValue({ value, quantity = false }: { value?: number; quantity?: boolean }) {
  const previous = useRef(value);
  const field = useRef<HTMLSpanElement>(null);
  const [pulse, setPulse] = useState({ revision: 0, changed: false });
  useEffect(() => {
    const node = field.current;
    const finish = () => setPulse(current => current.changed ? { ...current, changed: false } : current);
    node?.addEventListener("animationend", finish);
    node?.addEventListener("animationcancel", finish);
    return () => { node?.removeEventListener("animationend", finish); node?.removeEventListener("animationcancel", finish); };
  }, [pulse.revision]);
  useEffect(() => {
    if (previous.current === value) return;
    const changed = previous.current !== undefined && value !== undefined && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    previous.current = value;
    setPulse(current => ({ revision: current.revision + 1, changed }));
  }, [value]);
  return <span ref={field} key={pulse.revision} className={`${quantity ? "ct-opt-quantity" : "ct-opt-quote-value"}${pulse.changed ? " ct-opt-quote-changed" : ""}`}>
    {value === undefined ? "—" : `${quantity ? "" : "$ "}${formatOptionNumber(value)}`}
  </span>;
}

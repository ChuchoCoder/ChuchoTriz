import { useEffect, useRef, useState } from "react";
import { formatOptionNumber } from "./format";

type Pulse = { revision: number; kind?: "up" | "down" | "quantity" };

/** A change is relative to the last displayed value, never to an exchange timestamp. */
export function OptionQuoteValue({ value, quantity = false }: { value?: number; quantity?: boolean }) {
  const previous = useRef(value);
  const field = useRef<HTMLSpanElement>(null);
  const [pulse, setPulse] = useState<Pulse>({ revision: 0 });
  useEffect(() => {
    const node = field.current;
    if (!node || !pulse.kind) return;
    const finish = () => setPulse(current => current === pulse ? { revision: pulse.revision } : current);
    node.addEventListener("animationend", finish);
    node.addEventListener("animationcancel", finish);
    return () => { node.removeEventListener("animationend", finish); node.removeEventListener("animationcancel", finish); };
  }, [pulse]);
  useEffect(() => {
    const previousValue = previous.current;
    if (previousValue === value) return;
    previous.current = value;
    if (previousValue === undefined || value === undefined || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setPulse(current => current.kind ? { revision: current.revision } : current);
      return;
    }
    const direction = value > previousValue ? "up" : "down";
    setPulse(current => ({ revision: current.revision + 1, kind: quantity ? "quantity" : direction }));
  }, [quantity, value]);
  return <span ref={field} key={pulse.revision} className={`${quantity ? "ct-opt-quantity" : "ct-opt-quote-value"}${pulse.kind ? ` ct-opt-quote-changed ct-opt-quote-${pulse.kind}` : ""}`}>
    {value === undefined ? "—" : `${quantity ? "" : "$ "}${formatOptionNumber(value)}`}
  </span>;
}

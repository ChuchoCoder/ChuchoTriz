type Listener = (records: MutationRecord[]) => void;

const listeners = new Set<Listener>();
let observer: MutationObserver | undefined;

export function observePageStructure(listener: Listener) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(records => listeners.forEach(notify => notify(records)));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ct-ratios-slot"] });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; }
  };
}

export function containsChangedElements(records: MutationRecord[], selector: string) {
  for (const { addedNodes, removedNodes } of records) {
    for (const nodes of [addedNodes, removedNodes]) {
      for (const node of nodes) {
        // Integration markers have a class, an ID or a data attribute. Most quote text updates have none.
        if (node instanceof Element && (node.hasAttributes() && node.matches(selector) ||
          node.firstElementChild && node.querySelector(selector))) return true;
      }
    }
  }
  return false;
}

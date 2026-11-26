type PageStructureChange = {
  readonly targets: readonly Node[];
  readonly elements: readonly Element[];
  readonly ratioSlotChanged: boolean;
};
type Listener = (change: PageStructureChange) => void;

const listeners = new Set<Listener>();
let observer: MutationObserver | undefined;

export function observePageStructure(listener: Listener) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(records => {
      const targets: Node[] = [], elements: Element[] = [];
      let ratioSlotChanged = false;
      for (const { type, target, addedNodes, removedNodes } of records) {
        if (type === "attributes") { ratioSlotChanged = true; continue; }
        targets.push(target);
        for (const nodes of [addedNodes, removedNodes]) {
          for (const node of nodes) {
            // Markers have attributes or are descendants of a newly mounted element.
            if (node instanceof Element && (node.hasAttributes() || node.firstElementChild)) elements.push(node);
          }
        }
      }
      const change = { targets, elements, ratioSlotChanged };
      listeners.forEach(notify => notify(change));
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ct-ratios-slot"] });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; }
  };
}

export function containsChangedElements(elements: readonly Element[], selector: string) {
  return elements.some(node => node.matches(selector) || node.firstElementChild && node.querySelector(selector));
}

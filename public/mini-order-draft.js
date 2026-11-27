// Matriz unmounts Cantidad a mostrar when the mini panel is collapsed.
document.addEventListener("ct-clear-draft-display-quantity", event => {
  const form = document.getElementById("MiniOrderForm");
  if (!form || event.target !== form || !event.cancelable) return;

  const draft = window.mainStore?.uiStore?.newOrderMiniPanel;
  if (!draft || draft.isQuantity !== true || draft.sent || !("displayQty" in draft) ||
      typeof draft.setDisplayQuantity !== "function") return;

  // This is Matriz's untouched state. Clearing the input through the DOM writes null.
  if (draft.displayQty !== undefined) draft.setDisplayQuantity(undefined);
  if (draft.displayQty === undefined) event.preventDefault();
}, true);

document.addEventListener("ct-set-fractional-draft-quantity", event => {
  const form = document.getElementById("MiniOrderForm");
  if (!form || event.target !== form || !event.cancelable || typeof event.detail !== "string") return;

  const draft = window.mainStore?.uiStore?.newOrderMiniPanel;
  const precision = draft?.security?.refData?.sizePrecision;
  const parts = /^(\d+)\.(\d+)$/.exec(event.detail);
  if (!parts || draft?.isQuantity !== true || draft.sent || typeof draft.setQuantity !== "function" ||
      !Number.isInteger(precision) || precision < parts[2].length || precision > 15) return;

  const quantity = Number(event.detail);
  if (!Number.isSafeInteger(Math.trunc(quantity)) || quantity <= 0 ||
      quantity.toFixed(parts[2].length) !== event.detail) return;

  // Matriz truncates the binary product. Nudge the argument only if it lands below the intended quantity.
  const factor = 10 ** precision;
  const nativeQuantity = value => Math.floor(value * factor) / factor;
  const input = nativeQuantity(quantity) < quantity ? quantity + quantity * (Number.EPSILON / 2) : quantity;
  if (nativeQuantity(input) !== quantity) return;
  draft.setQuantity(input);
  if (draft.quantity === quantity) event.preventDefault();
}, true);

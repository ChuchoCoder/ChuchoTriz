export function installToolStyles(css: string) {
  if (typeof document === "undefined" || !document.adoptedStyleSheets) return;
  // Use a constructed sheet so a Matriz page does not need a stylesheet link for a tool.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

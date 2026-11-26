export const themes = Object.freeze(['dark', 'light']);

// Representative Matriz host surfaces. Extension colors come from the built CSS.
const palettes = {
  dark: {
    'base-miniorder': '#222936', 'panel-body-background': '#212936', 'text-color': '#fff',
    'icons': '#fff', 'direct-access-bar-background': '#303843', 'ant-input-background': '#19222e',
    'ant-button-text-color': '#4bb9ec', 'execution-text-color': '#b2b6bc', 'modal-border-color': '#8190a5',
  },
  light: {
    'base-miniorder': '#e5e4e5', 'panel-body-background': '#f5f6fa', 'text-color': '#222936',
    'icons': '#222936', 'direct-access-bar-background': '#eaeaea', 'ant-input-background': '#ededed',
    'ant-button-text-color': '#170b52', 'execution-text-color': '#505c70', 'modal-border-color': '#7b8494',
  },
};

export function fixtureTheme(theme = process.env.CHUCHOTRIZ_PREVIEW_THEME ?? 'dark') {
  if (!themes.includes(theme)) throw Error(`Unknown fixture theme ${theme}`);
  const tokens = Object.entries(palettes[theme]).map(([key, value]) => `--${key}:${value};`).join('');
  return {
    attribute: theme === 'light' ? 'dma_day' : 'dma_night',
    style: `<style>
      :root { color-scheme: ${theme}; ${tokens} }
      body { background:var(--base-miniorder); color:var(--text-color); }
      .DirectAccessBar, #ToolPanel { background:var(--direct-access-bar-background); }
      .DirectAccessBar a, .MiniOrderForm_buttonsBlock .ButtonLimpiar { color:var(--icons); }
      #MiniOrderForm { background:var(--base-miniorder); color:var(--icons); }
      .MiniOrderForm_buttonsBlock .ButtonLimpiar { border:1px solid currentColor; background:transparent; }
    </style>`,
  };
}

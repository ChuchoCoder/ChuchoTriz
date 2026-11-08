const paths = {
  simulator: "M3 1.5h10v13H3zM5.5 4h5M5.5 7h.5m4 0h.5m-5 3h.5m4 0h.5m-5 2h.5m4 0h.5",
  operations: "M3 2h10v12H3zM5.5 5h5m-5 3h5m-5 3h3",
  presets: "M9 1.5 3 9h4l-1 5.5L13 7H9z",
  strategy: "M8 2 2 5l6 3 6-3-6-3ZM2 8l6 3 6-3M2 11l6 3 6-3",
  quotes: "M4 2v3m0 5v4m8-12v5m0 5v2M2 5h4v5H2zM10 7h4v5h-4z",
  position: "M2 5h12v8H2zM6 5V3h4v2M2 8l6 2 6-2",
  build: "M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2zM12 10v4m-2-2h4",
  analysis: "M2 2v12h12M5 10l3-4 3 2 3-5",
  clear: "M2.5 4h11M6 4V2h4v2M4 4l.8 10h6.4L12 4M6.5 7v4m3-4v4",
  new: "M9 2H3v12h10V6L9 2zm0 0v4h4M6 10h4m-2-2v4",
  refresh: "M13.5 2.5V6H10M2.5 13.5V10H6M2.8 6a5.5 5.5 0 0 1 9-2.3l1.7 2.2M13.2 10a5.5 5.5 0 0 1-9 2.3l-1.7-2.2",
};

export default function ToolbarIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="ct-tool-icon" aria-hidden="true" focusable="false"
    width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}

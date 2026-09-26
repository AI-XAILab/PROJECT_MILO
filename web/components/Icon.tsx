export type IconName = "plus" | "chat" | "compass" | "info" | "settings" | "panel" | "arrow" | "trash" | "close" | "spark";
const paths: Record<IconName, string> = {
  plus: "M12 5v14M5 12h14", chat: "M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM7 9h8M7 13h5",
  compass: "m16 8-3 5-5 3 3-5 5-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  info: "M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6", panel: "M9 4v16M4 4h16v16H4Z",
  arrow: "M12 19V5m-6 6 6-6 6 6", trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  close: "m6 6 12 12M6 18 18 6", spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
};
export default function Icon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

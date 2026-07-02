/* Stage colour to tailwind/style helpers */

export function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const bigint = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

export function stageBadgeStyle(hex) {
  if (!hex) return { backgroundColor: "#f1f5f9", color: "#475569", borderColor: "#e2e8f0" };
  const { r, g, b } = hexToRgb(hex);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
    color: hex,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
  };
}

export function ageingBucket(days) {
  if (days <= 3) return { name: "0-3", color: "#10b981", label: "Fresh" };
  if (days <= 7) return { name: "4-7", color: "#fbbf24", label: "Watch" };
  if (days <= 15) return { name: "8-15", color: "#f97316", label: "Delay" };
  return { name: "15+", color: "#e11d48", label: "Critical" };
}

export function fmtDate(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch { return s; }
}

export function fmtDateTime(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

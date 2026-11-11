/** Kayıt listesindeki küçük rota çizimi (eşit-açılı izdüşüm yeterli). */
export function RouteThumb({ pts, w = 56, h = 36 }: { pts: [number, number][]; w?: number; h?: number }) {
  if (pts.length < 2) return <div style={{ width: w, height: h }} />;
  const k = Math.cos((pts[0][1] * Math.PI) / 180);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [lo, la] of pts) {
    x1 = Math.min(x1, lo * k); x2 = Math.max(x2, lo * k);
    y1 = Math.min(y1, la); y2 = Math.max(y2, la);
  }
  const pad = 3;
  const s = Math.min((w - 2 * pad) / (x2 - x1 || 1e-9), (h - 2 * pad) / (y2 - y1 || 1e-9));
  const ox = (w - (x2 - x1) * s) / 2, oy = (h - (y2 - y1) * s) / 2;
  const d = pts.map(([lo, la], i) => `${i ? 'L' : 'M'}${(ox + (lo * k - x1) * s).toFixed(1)},${(oy + (y2 - la) * s).toFixed(1)}`).join('');
  const [sx, sy] = [ox + (pts[0][0] * k - x1) * s, oy + (y2 - pts[0][1]) * s];
  return (
    <svg width={w} height={h} className="shrink-0">
      <rect width={w} height={h} rx="2" fill="#131415" />
      <path d={d} fill="none" stroke="#f0a03c" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx} cy={sy} r="2" fill="#5fb57f" />
    </svg>
  );
}

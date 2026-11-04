// The island drawn as a map: flat colours for the sea, the beach and each
// tier, the river and the paths, a darker line along every cliff's edge,
// and small marks for trees, rocks and the house. Any 2D canvas draws it:
// the browser's map, the console's touch screen (through the export) and
// scripts/map.ts.

import { GROUND, PROP_RADIUS, groundAt, inMap, tierAt, type IslandMap } from "../core/island.ts";

export const MAP_COLORS = {
  sea: "#7ccfe4",
  deep: "#5cb8d6",
  foam: "#c9f0f6",
  sand: "#f4e4b3",
  grass: ["#f4e4b3", "#93d26c", "#7cc35a", "#68b14b"],
  edge: ["#d9c48c", "#5f9f43", "#508c37", "#437a2d"],
  water: "#62c3e8",
  path: "#e0c98f",
  bridge: "#b9814e",
  tree: "#3f8a3a",
  cedar: "#2f6f38",
  palm: "#5aa84a",
  rock: "#a3a39b",
  house: "#f2806b",
  wall: "#fffbee",
  stall: "#c99563",
};

type Ctx = Pick<CanvasRenderingContext2D, "fillStyle" | "strokeStyle" | "lineWidth" | "fillRect" | "beginPath" | "arc" | "fill" | "stroke" | "moveTo" | "lineTo" | "closePath" | "lineJoin">;

/** Draws `m` with each tile `s` pixels square, its top left at (0, 0). */
export function drawMap(g: Ctx, m: IslandMap, s: number): void {
  for (let j = 0; j < m.d; j++) {
    for (let i = 0; i < m.w; i++) {
      const ground = groundAt(m, i, j);
      const t = tierAt(m, i, j);
      g.fillStyle = ground === GROUND.sea ? (m.seaDistance[j * m.w + i]! === 0 && nearLand(m, i, j) ? MAP_COLORS.sea : MAP_COLORS.deep)
        : ground === GROUND.water ? MAP_COLORS.water
        : ground === GROUND.sand ? MAP_COLORS.sand
        : ground === GROUND.path ? MAP_COLORS.path
        : MAP_COLORS.grass[t]!;
      g.fillRect(i * s, j * s, s, s);
    }
  }
  // A cliff's edge: a darker line where a tile stands above its neighbour.
  g.lineWidth = Math.max(1, s * 0.28);
  for (let j = 0; j < m.d; j++) {
    for (let i = 0; i < m.w; i++) {
      const t = tierAt(m, i, j);
      if (t < 2 && groundAt(m, i, j) !== GROUND.grass && groundAt(m, i, j) !== GROUND.path) continue;
      g.strokeStyle = MAP_COLORS.edge[t]!;
      for (const [di, dj, x0, y0, x1, y1] of [[0, 1, 0, 1, 1, 1], [0, -1, 0, 0, 1, 0], [1, 0, 1, 0, 1, 1], [-1, 0, 0, 0, 0, 1]] as const) {
        if (!inMap(m, i + di, j + dj) || tierAt(m, i + di, j + dj) >= t || t < 2) continue;
        if (m.ramps.some((r) => i + 0.5 > r.rect[0] - 0.5 && i + 0.5 < r.rect[2] + 0.5 && j + dj + 0.5 > r.rect[1] && j + dj + 0.5 < r.rect[3])) continue;
        g.beginPath();
        g.moveTo((i + x0) * s, (j + y0) * s);
        g.lineTo((i + x1) * s, (j + y1) * s);
        g.stroke();
      }
    }
  }
  for (const r of m.ramps) {
    g.fillStyle = MAP_COLORS.path;
    g.fillRect(r.rect[0] * s, r.rect[1] * s, (r.rect[2] - r.rect[0]) * s, (r.rect[3] - r.rect[1]) * s);
  }
  for (const b of m.bridges) {
    g.fillStyle = MAP_COLORS.bridge;
    const inset = s * 0.25;
    if (b.axis === "x") g.fillRect(b.rect[0] * s, b.rect[1] * s + inset, (b.rect[2] - b.rect[0]) * s, (b.rect[3] - b.rect[1]) * s - inset * 2);
    else g.fillRect(b.rect[0] * s + inset, b.rect[1] * s, (b.rect[2] - b.rect[0]) * s - inset * 2, (b.rect[3] - b.rect[1]) * s);
  }
  for (const p of m.props) {
    if (!PROP_RADIUS[p.kind] || p.kind === "lamp" || p.kind === "mailbox") continue;
    g.fillStyle = p.kind === "rock" ? MAP_COLORS.rock : p.kind === "cedar" ? MAP_COLORS.cedar : p.kind === "palm" ? MAP_COLORS.palm : MAP_COLORS.tree;
    g.beginPath();
    g.arc(p.x * s, p.z * s, s * (p.kind === "bush" || p.kind === "rock" ? 0.42 : 0.62), 0, Math.PI * 2);
    g.fill();
  }
  drawHouse(g, m, s);
  drawShop(g, m, s);
}

function nearLand(m: IslandMap, i: number, j: number): boolean {
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (inMap(m, i + di, j + dj) && groundAt(m, i + di, j + dj) !== GROUND.sea) return true;
  return false;
}

/** The shop as a little stall: its counter, under an awning striped coral and cream. */
function drawShop(g: Ctx, m: IslandMap, s: number): void {
  const [x0, z0, x1, z1] = m.shop.rect;
  const w = (x1 - x0) * s, h = (z1 - z0) * s;
  g.fillStyle = MAP_COLORS.stall;
  g.fillRect(x0 * s + w * 0.08, z0 * s + h * 0.5, w * 0.84, h * 0.5);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = k % 2 ? MAP_COLORS.wall : MAP_COLORS.house;
    g.fillRect(x0 * s + (w * k) / 4, z0 * s, w / 4 + 0.5, h * 0.55);
  }
}

/** The house as a little house: walls and a roof, over its footprint. */
function drawHouse(g: Ctx, m: IslandMap, s: number): void {
  const [x0, z0, x1, z1] = m.house.rect;
  const cx = ((x0 + x1) / 2) * s, w = (x1 - x0) * s, h = (z1 - z0) * s;
  g.fillStyle = MAP_COLORS.wall;
  g.fillRect(x0 * s + w * 0.12, z0 * s + h * 0.38, w * 0.76, h * 0.62);
  g.fillStyle = MAP_COLORS.house;
  g.beginPath();
  g.moveTo(x0 * s - s * 0.1, z0 * s + h * 0.45);
  g.lineTo(cx, z0 * s - h * 0.05);
  g.lineTo(x1 * s + s * 0.1, z0 * s + h * 0.45);
  g.closePath();
  g.fill();
  g.fillStyle = "#b9814e";
  g.fillRect(cx - s * 0.4, z1 * s - h * 0.36, s * 0.8, h * 0.36);
}

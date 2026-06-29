import type { ContainerFn, LNode, PositionedBox } from "../types";
import { parseDimen } from "../values";

const lastName = (tag: string) => { const i = tag.lastIndexOf("."); return i >= 0 ? tag.slice(i + 1) : tag; };
const idRef = (v: string | undefined): string | null => {
  if (!v) return null;
  if (v === "parent") return "parent";
  const m = /^@\+?id\/(.+)$/.exec(v);
  return m ? m[1] : null;
};
const numf = (s: string | undefined, dflt: number): number => {
  if (s == null) return dflt; const n = parseFloat(s); return isNaN(n) ? dflt : n;
};

type Side = "lead" | "trail";
type Group = [string, Side];

// Each group maps an anchor attribute to which EDGE of the target it references.
const H_LEAD: Group[] = [
  ["layout_constraintStart_toStartOf", "lead"],
  ["layout_constraintStart_toEndOf", "trail"],
  ["layout_constraintLeft_toLeftOf", "lead"],
  ["layout_constraintLeft_toRightOf", "trail"],
];
const H_TRAIL: Group[] = [
  ["layout_constraintEnd_toEndOf", "trail"],
  ["layout_constraintEnd_toStartOf", "lead"],
  ["layout_constraintRight_toRightOf", "trail"],
  ["layout_constraintRight_toLeftOf", "lead"],
];
const V_LEAD: Group[] = [
  ["layout_constraintTop_toTopOf", "lead"],
  ["layout_constraintTop_toBottomOf", "trail"],
  ["layout_constraintBaseline_toBaselineOf", "lead"],
];
const V_TRAIL: Group[] = [
  ["layout_constraintBottom_toBottomOf", "trail"],
  ["layout_constraintBottom_toTopOf", "lead"],
];

interface AxisCfg {
  extent: number;
  nat: number[];
  mode: ("match" | "wrap" | "fixed" | "constraint")[];
  leadG: Group[];
  trailG: Group[];
  leadM: number[];
  trailM: number[];
  biasAttr: string;
  chainAttr: string;
  guideHere: boolean[]; // true if a Guideline child defines THIS axis
}

export const layoutConstraint: ContainerFn = (node, boxW, boxH, maxW, maxH, place, ctx) => {
  const children = node.children;
  const W = boxW ?? maxW;
  const H = boxH ?? maxH;
  const n = children.length;

  const byId = new Map<string, number>();
  children.forEach((c, i) => { if (c.id) byId.set(c.id, i); });

  const boxes: PositionedBox[] = children.map((c) => place(c, maxW, maxH));

  const dpx = (c: LNode, k: string) => { const x = parseDimen(c.attrs[k], ctx.density, ctx.fontScale); return x.mode === "fixed" ? x.px : 0; };
  const margins = (c: LNode) => {
    const all = dpx(c, "layout_margin");
    return {
      l: c.attrs.layout_marginStart || c.attrs.layout_marginLeft ? (dpx(c, "layout_marginStart") || dpx(c, "layout_marginLeft")) : all,
      t: c.attrs.layout_marginTop ? dpx(c, "layout_marginTop") : all,
      r: c.attrs.layout_marginEnd || c.attrs.layout_marginRight ? (dpx(c, "layout_marginEnd") || dpx(c, "layout_marginRight")) : all,
      b: c.attrs.layout_marginBottom ? dpx(c, "layout_marginBottom") : all,
    };
  };
  const m = children.map(margins);

  const wMode = children.map((c) => parseDimen(c.attrs.layout_width, ctx.density, ctx.fontScale).mode);
  const hMode = children.map((c) => parseDimen(c.attrs.layout_height, ctx.density, ctx.fontScale).mode);
  // 0dp natural size is 0 (the solver fills it); other modes keep the measured size.
  const natW = boxes.map((b, i) => (wMode[i] === "constraint" ? 0 : b.w));
  const natH = boxes.map((b, i) => (hMode[i] === "constraint" ? 0 : b.h));

  // dimensionRatio (best-effort): derive the 0dp dimension from the definite one.
  children.forEach((c, i) => {
    const r = c.attrs.layout_constraintDimensionRatio;
    if (!r) return;
    const parts = r.split(",");
    const seg = parts[parts.length - 1].split(":");
    const rw = parseFloat(seg[0]);
    const rh = parseFloat(seg.length > 1 ? seg[1] : "1");
    if (isNaN(rw) || isNaN(rh) || rw === 0 || rh === 0) return;
    if (wMode[i] === "constraint" && hMode[i] !== "constraint") natW[i] = natH[i] * (rw / rh);
    else if (hMode[i] === "constraint" && wMode[i] !== "constraint") natH[i] = natW[i] * (rh / rw);
  });

  const isGuide = children.map((c) => lastName(c.tag) === "Guideline");
  const guideVertical = children.map((c) => (c.attrs.orientation || "vertical") === "vertical");
  const guideCoord = (i: number, extent: number) => {
    const a = children[i].attrs;
    if (a.layout_constraintGuide_percent != null) return parseFloat(a.layout_constraintGuide_percent) * extent;
    if (a.layout_constraintGuide_begin != null) return dpx(children[i], "layout_constraintGuide_begin");
    if (a.layout_constraintGuide_end != null) return extent - dpx(children[i], "layout_constraintGuide_end");
    return 0;
  };

  const solveAxis = (cfg: AxisCfg) => {
    const pos = new Array<number>(n).fill(0);
    const size = cfg.nat.slice();
    const st = new Array<number>(n).fill(0); // 0 todo, 1 resolving, 2 done
    const processed = new Array<boolean>(n).fill(false);

    const firstRef = (i: number, groups: Group[]): { target: string; side: Side } | null => {
      for (const [attr, side] of groups) {
        const v = children[i].attrs[attr];
        if (v) { const t = idRef(v); if (t) return { target: t, side }; }
      }
      return null;
    };

    const edge = (ref: { target: string; side: Side }): number => {
      if (ref.target === "parent") return ref.side === "lead" ? 0 : cfg.extent;
      const j = byId.get(ref.target);
      if (j == null) { console.warn("[layoutConstraint] missing ref", ref.target); return ref.side === "lead" ? 0 : cfg.extent; }
      solveOne(j);
      return ref.side === "lead" ? pos[j] : pos[j] + size[j];
    };

    function solveOne(i: number) {
      if (st[i] >= 1) return; // done, or resolving -> cycle break (use provisional pos[i]=0)
      st[i] = 1;
      const lead = firstRef(i, cfg.leadG);
      const trail = firstRef(i, cfg.trailG);
      const lm = cfg.leadM[i];
      const tm = cfg.trailM[i];
      if (lead && trail) {
        const a = edge(lead) + lm;
        const b = edge(trail) - tm;
        if (cfg.mode[i] === "constraint") {
          size[i] = Math.max(0, b - a);
          pos[i] = a;
        } else {
          const bias = numf(children[i].attrs[cfg.biasAttr], 0.5);
          pos[i] = a + bias * ((b - a) - size[i]);
        }
      } else if (lead) {
        pos[i] = edge(lead) + lm;
      } else if (trail) {
        pos[i] = edge(trail) - tm - size[i];
      } else {
        pos[i] = lm;
      }
      st[i] = 2;
    }

    // 1) Guidelines: fixed coordinate, zero size, in their defining axis only.
    children.forEach((_, i) => {
      if (!isGuide[i]) return;
      pos[i] = cfg.guideHere[i] ? guideCoord(i, cfg.extent) : 0;
      size[i] = 0;
      st[i] = 2;
    });

    // 2) Basic parent-bounded chains (spread / spread_inside / packed).
    children.forEach((_, i) => {
      if (isGuide[i] || st[i] === 2 || processed[i]) return;
      const lead = firstRef(i, cfg.leadG);
      const trail = firstRef(i, cfg.trailG);
      if (!lead || lead.target !== "parent" || !trail || trail.target === "parent") return;
      const chain: number[] = [i];
      let cur = i;
      let ok = false;
      while (true) {
        const tr = firstRef(cur, cfg.trailG);
        if (!tr) break;
        if (tr.target === "parent") { ok = chain.length >= 2; break; }
        const j = byId.get(tr.target);
        if (j == null) break;
        const ld = firstRef(j, cfg.leadG);
        if (!ld || ld.target !== children[cur].id) break;
        chain.push(j); cur = j;
        if (chain.length > n) break;
      }
      if (!ok) return;
      const head = chain[0]; const tail = chain[chain.length - 1];
      const left = cfg.leadM[head]; // parent lead edge (0) + head lead margin
      const right = cfg.extent - cfg.trailM[tail];
      const span = right - left;
      const total = chain.reduce((s, k) => s + size[k], 0);
      const style = children[head].attrs[cfg.chainAttr] || "spread";
      let cursor: number; let gap: number;
      if (style === "packed") {
        cursor = left + (span - total) / 2; gap = 0;
      } else if (style === "spread_inside") {
        gap = chain.length > 1 ? (span - total) / (chain.length - 1) : 0; cursor = left;
      } else {
        gap = (span - total) / (chain.length + 1); cursor = left + gap;
      }
      chain.forEach((k) => { pos[k] = cursor; cursor += size[k] + gap; st[k] = 2; processed[k] = true; });
    });

    // 3) Everyone else.
    children.forEach((_, i) => solveOne(i));
    return { pos, size };
  };

  const hr = solveAxis({
    extent: W, nat: natW, mode: wMode, leadG: H_LEAD, trailG: H_TRAIL,
    leadM: m.map((x) => x.l), trailM: m.map((x) => x.r),
    biasAttr: "layout_constraintHorizontal_bias", chainAttr: "layout_constraintHorizontal_chainStyle",
    guideHere: guideVertical,
  });
  const vr = solveAxis({
    extent: H, nat: natH, mode: hMode, leadG: V_LEAD, trailG: V_TRAIL,
    leadM: m.map((x) => x.t), trailM: m.map((x) => x.b),
    biasAttr: "layout_constraintVertical_bias", chainAttr: "layout_constraintVertical_chainStyle",
    guideHere: guideVertical.map((g) => !g),
  });

  boxes.forEach((b, i) => { b.x = hr.pos[i]; b.w = hr.size[i]; b.y = vr.pos[i]; b.h = vr.size[i]; });

  let contentW = 0, contentH = 0;
  boxes.forEach((b) => { contentW = Math.max(contentW, b.x + b.w); contentH = Math.max(contentH, b.y + b.h); });
  return { children: boxes, contentW: boxW ?? contentW, contentH: boxH ?? contentH };
};

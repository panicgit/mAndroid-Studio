import type { ContainerFn, LNode, PositionedBox } from "../types";
import { parseDimen } from "../values";

const idRef = (v: string | undefined): string | null => {
  if (!v) return null;
  const m = /^@\+?id\/(.+)$/.exec(v);
  return m ? m[1] : null;
};
const isTrue = (v: string | undefined) => v === "true";

export const layoutRelative: ContainerFn = (node, boxW, boxH, maxW, maxH, place, ctx) => {
  const children = node.children;
  const W = boxW ?? maxW;
  const H = boxH ?? maxH;

  const byId = new Map<string, number>();
  children.forEach((c, i) => { if (c.id) byId.set(c.id, i); });

  const boxes: PositionedBox[] = children.map((c) => place(c, maxW, maxH));

  const margins = (c: LNode) => {
    const d = (k: string) => { const x = parseDimen(c.attrs[k], ctx.density, ctx.fontScale); return x.mode === "fixed" ? x.px : 0; };
    const all = d("layout_margin");
    return {
      l: c.attrs.layout_marginStart || c.attrs.layout_marginLeft ? (d("layout_marginStart") || d("layout_marginLeft")) : all,
      t: c.attrs.layout_marginTop ? d("layout_marginTop") : all,
      r: c.attrs.layout_marginEnd || c.attrs.layout_marginRight ? (d("layout_marginEnd") || d("layout_marginRight")) : all,
      b: c.attrs.layout_marginBottom ? d("layout_marginBottom") : all,
    };
  };
  const m = children.map(margins);

  const stateX = children.map(() => 0); // 0=todo 1=resolving 2=done
  const stateY = children.map(() => 0);
  const xs = children.map(() => 0);
  const ys = children.map(() => 0);

  const sib = (v: string | undefined): number | null => {
    const id = idRef(v); if (id == null) return null;
    const j = byId.get(id); return j == null ? null : j;
  };

  const resolveX = (i: number): number => {
    if (stateX[i] === 2) return xs[i];
    if (stateX[i] === 1) { console.warn("[layoutRelative] horizontal cycle at", children[i].id); return xs[i]; }
    stateX[i] = 1;
    const a = children[i].attrs;
    const w = boxes[i].w;
    let lx = m[i].l; // default: top-left + margin
    if (isTrue(a.layout_alignParentLeft) || isTrue(a.layout_alignParentStart)) lx = m[i].l;
    if (isTrue(a.layout_alignParentRight) || isTrue(a.layout_alignParentEnd)) lx = W - m[i].r - w;
    if (isTrue(a.layout_centerHorizontal) || isTrue(a.layout_centerInParent)) lx = (W - w) / 2;
    let j: number | null;
    if ((j = sib(a.layout_toRightOf)) != null || (j = sib(a.layout_toEndOf)) != null) lx = resolveX(j!) + boxes[j!].w + m[i].l;
    if ((j = sib(a.layout_toLeftOf)) != null || (j = sib(a.layout_toStartOf)) != null) lx = resolveX(j!) - m[i].r - w;
    if ((j = sib(a.layout_alignLeft)) != null || (j = sib(a.layout_alignStart)) != null) lx = resolveX(j!) + m[i].l;
    if ((j = sib(a.layout_alignRight)) != null || (j = sib(a.layout_alignEnd)) != null) lx = (resolveX(j!) + boxes[j!].w) - m[i].r - w;
    xs[i] = lx; stateX[i] = 2; return lx;
  };

  const resolveY = (i: number): number => {
    if (stateY[i] === 2) return ys[i];
    if (stateY[i] === 1) { console.warn("[layoutRelative] vertical cycle at", children[i].id); return ys[i]; }
    stateY[i] = 1;
    const a = children[i].attrs;
    const h = boxes[i].h;
    let ly = m[i].t;
    if (isTrue(a.layout_alignParentTop)) ly = m[i].t;
    if (isTrue(a.layout_alignParentBottom)) ly = H - m[i].b - h;
    if (isTrue(a.layout_centerVertical) || isTrue(a.layout_centerInParent)) ly = (H - h) / 2;
    let j: number | null;
    if ((j = sib(a.layout_below)) != null) ly = resolveY(j!) + boxes[j!].h + m[i].t;
    if ((j = sib(a.layout_above)) != null) ly = resolveY(j!) - m[i].b - h;
    if ((j = sib(a.layout_alignTop)) != null) ly = resolveY(j!) + m[i].t;
    if ((j = sib(a.layout_alignBottom)) != null) ly = (resolveY(j!) + boxes[j!].h) - m[i].b - h;
    if ((j = sib(a.layout_alignBaseline)) != null) ly = resolveY(j!) + m[i].t;
    ys[i] = ly; stateY[i] = 2; return ly;
  };

  children.forEach((_, i) => { resolveX(i); resolveY(i); });
  boxes.forEach((b, i) => { b.x = xs[i]; b.y = ys[i]; });

  let contentW = 0, contentH = 0;
  boxes.forEach((b) => { contentW = Math.max(contentW, b.x + b.w); contentH = Math.max(contentH, b.y + b.h); });
  return { children: boxes, contentW: boxW ?? contentW, contentH: boxH ?? contentH };
};

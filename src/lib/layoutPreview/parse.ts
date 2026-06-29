import type { LNode } from "./types";

const localName = (s: string) => {
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(i + 1) : s;
};
const nsPrefix = (s: string) => {
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(0, i) : "";
};

function toLNode(el: Element): LNode {
  const attrs: Record<string, string> = {};
  const toolsAttrs: Record<string, string> = {};
  let id: string | undefined;
  for (const a of Array.from(el.attributes)) {
    const prefix = nsPrefix(a.name);
    const name = localName(a.name);
    if (name.startsWith("xmlns")) continue;
    if (prefix === "tools") { toolsAttrs[name] = a.value; continue; }
    if (name === "id") {
      id = a.value.replace(/^@\+?id\//, "");
    }
    attrs[name] = a.value;
  }
  // tools:* 가 동명 android:* 를 덮어쓴다 (디자인타임 오버라이드)
  Object.assign(attrs, toolsAttrs);

  const children: LNode[] = [];
  for (const c of Array.from(el.children)) {
    if (localName(c.tagName) === "data") continue; // data-binding <data> block
    children.push(toLNode(c));
  }
  return { tag: el.tagName, attrs, children, id };
}

const layoutRef = (v: string | undefined): string | null => {
  const m = /^@layout\/(.+)$/.exec(v || "");
  return m ? m[1] : null;
};

// Replace <include layout="@layout/x"> nodes with the parsed root of x (carrying the
// include tag's layout_* attrs onto the substitute, as Android does). Missing layouts
// become a labeled "include" placeholder leaf.
function inlineIncludes(node: LNode, includes: Record<string, string>): LNode {
  if (localName(node.tag) === "include") {
    const name = layoutRef(node.attrs.layout);
    const xml = name ? includes[name] : undefined;
    if (name && xml) {
      const parsed = parseLayout(xml, includes);
      if (parsed.root) {
        const sub = parsed.root;
        // Android: layout_* on <include> override the included root's same attrs.
        for (const [k, val] of Object.entries(node.attrs)) {
          if (k.startsWith("layout_") || k === "id") sub.attrs[k] = val;
        }
        if (node.id) sub.id = node.id;
        return sub;
      }
    }
    return node; // placeholder leaf: tag "include", attrs.layout kept
  }
  node.children = node.children.map((c) => inlineIncludes(c, includes));
  return node;
}

export function parseLayout(
  xml: string,
  includes?: Record<string, string>,
): { root: LNode | null; error: string | null } {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) return { root: null, error: err.textContent?.trim() || "XML parse error" };
    const el = doc.documentElement;
    if (!el) return { root: null, error: "empty document" };
    let rootEl: Element = el;
    if (localName(el.tagName) === "layout") {
      // Android data-binding wrapper: drop <data>, use the first real child element.
      const real = Array.from(el.children).find((c) => localName(c.tagName) !== "data");
      if (!real) return { root: null, error: "empty <layout>" };
      rootEl = real;
    }
    const node = toLNode(rootEl);
    return { root: inlineIncludes(node, includes ?? {}), error: null };
  } catch (e) {
    return { root: null, error: e instanceof Error ? e.message : String(e) };
  }
}

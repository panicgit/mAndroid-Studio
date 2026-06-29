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
  for (const c of Array.from(el.children)) children.push(toLNode(c));
  return { tag: el.tagName, attrs, children, id };
}

export function parseLayout(xml: string): { root: LNode | null; error: string | null } {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) return { root: null, error: err.textContent?.trim() || "XML parse error" };
    const el = doc.documentElement;
    if (!el) return { root: null, error: "empty document" };
    return { root: toLNode(el), error: null };
  } catch (e) {
    return { root: null, error: e instanceof Error ? e.message : String(e) };
  }
}

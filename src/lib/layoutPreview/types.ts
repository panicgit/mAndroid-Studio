// 레이아웃 프리뷰 엔진의 공유 타입. 모든 계산은 dp 단위.

// android:layout_width / layout_height 한 축의 의미.
export type SizeMode = "match" | "wrap" | "fixed" | "constraint"; // constraint = 0dp
export interface Dimen { mode: SizeMode; px: number } // px(=dp)는 mode==="fixed"일 때만 유효

// 파싱된 뷰 노드. 네임스페이스는 벗기고 local name만 키로 쓴다.
// android:* 와 app:* 는 같은 attrs 맵에 병합되고, tools:* 는 동명 속성을 덮어쓴다.
export interface LNode {
  tag: string;                    // 원본 태그(예: "TextView", "androidx.constraintlayout.widget.ConstraintLayout")
  attrs: Record<string, string>;  // local attr name → 값
  children: LNode[];
  id?: string;                    // android:id "@+id/foo" → "foo"
}

export interface Size { w: number; h: number }

// 배치 결과. x/y는 부모 content box 기준 상대 좌표(dp).
export interface PositionedBox {
  node: LNode;
  x: number; y: number; w: number; h: number;
  children: PositionedBox[];
}

// 컨테이너 fn이 부모(place)에게 돌려주는 결과.
export interface ContainerResult {
  children: PositionedBox[]; // x/y가 부모 content box 기준으로 채워진 자식들
  contentW: number;          // wrap일 때 컨테이너가 원하는 content 너비(dp)
  contentH: number;
}

// 리프 노드의 고유 크기를 재는 오라클. maxW/maxH는 사용 가능한 상한(dp).
export type Measure = (node: LNode, maxW: number, maxH: number) => Size;

// @string/@color/@dimen 해석.
export interface ResourceProvider {
  string(name: string): string | null; // 표시 문자열
  color(name: string): string | null;  // CSS 색 문자열
  dimen(name: string): number | null;   // dp
  drawable(name: string): Drawable | null;   // ADD — Drawable defined in this file (Task 1)
}

export type Drawable =
  | { kind: "vector"; svg: string }
  | { kind: "shape"; css: Record<string, string> };

// place()가 자식을 배치할 때 넘기는 콜백 (engine이 제공).
export type Place = (child: LNode, maxW: number, maxH: number) => PositionedBox;

// 컨테이너 모듈 시그니처. boxW/boxH는 해당 축이 exact(match/fixed)면 그 크기, wrap이면 null.
export type ContainerFn = (
  node: LNode,
  boxW: number | null,
  boxH: number | null,
  maxW: number,
  maxH: number,
  place: Place,
  ctx: LayoutCtx,
) => ContainerResult;

export interface LayoutCtx {
  res: ResourceProvider;
  measure: Measure;
  density: number;   // dpi/160 (예: 2.75)
  fontScale: number; // 기본 1
}

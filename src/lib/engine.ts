import { FILES as __FILES } from "./data";
/* DAS — engine: syntax highlighting, logcat stream, build script, search */

  // ---------------------------------------------------------------
  // Syntax highlighter — tokenizes Kotlin / XML / Gradle / properties
  // Returns HTML with <span class="tok-*"> wrappers. Escapes input.
  // ---------------------------------------------------------------
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const KOTLIN_KW = new Set(("package import class object interface fun val var if else when for while do return " +
    "private public protected internal override open abstract final sealed data enum companion " +
    "suspend by lazy in is as out reified inline crossinline noinline vararg init this super null true false " +
    "get set field constructor where typealias annotation operator infix lateinit").split(" "));

  function highlightKotlin(src) {
    // tokenize line-aware-ish but globally fine
    let out = "";
    const re = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(@[A-Za-z_][\w.]*)|(\b\d[\d_]*\.?\d*[fFlL]?\b)|([A-Za-z_]\w*)|([\s\S])/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1]) out += `<span class="tok-comment">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-comment">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-string">${esc(m[3])}</span>`;
      else if (m[4]) out += `<span class="tok-anno">${esc(m[4])}</span>`;
      else if (m[5]) out += `<span class="tok-num">${esc(m[5])}</span>`;
      else if (m[6]) {
        const w = m[6];
        if (KOTLIN_KW.has(w)) out += `<span class="tok-kw">${esc(w)}</span>`;
        else if (/^[A-Z]/.test(w)) out += `<span class="tok-type">${esc(w)}</span>`;
        else out += esc(w);
      }
      else out += esc(m[7]);
    }
    return out;
  }

  function highlightXml(src) {
    let out = "";
    const re = /(<!--[\s\S]*?-->)|(<\?[\s\S]*?\?>)|(<\/?)([A-Za-z_][\w:.-]*)|([A-Za-z_][\w:.-]*)(=)("(?:[^"]*)")|(\/?>)|([\s\S])/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1]) out += `<span class="tok-comment">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-comment">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-punc">${esc(m[3])}</span><span class="tok-tag">` + (m[4] ? esc(m[4]) : "") + `</span>`;
      else if (m[5] && m[6] && m[7]) out += `<span class="tok-attr">${esc(m[5])}</span><span class="tok-punc">=</span><span class="tok-string">${esc(m[7])}</span>`;
      else if (m[8]) out += `<span class="tok-punc">${esc(m[8])}</span>`;
      else out += esc(m[9] || "");
    }
    return out;
  }

  function highlightProps(src) {
    return src.split("\n").map((line) => {
      if (/^\s*#/.test(line)) return `<span class="tok-comment">${esc(line)}</span>`;
      const i = line.indexOf("=");
      if (i < 0) return esc(line);
      return `<span class="tok-attr">${esc(line.slice(0, i))}</span><span class="tok-punc">=</span><span class="tok-string">${esc(line.slice(i + 1))}</span>`;
    }).join("\n");
  }

  function highlight(path, src) {
    if (/\.(kt|java)$/.test(path)) return highlightKotlin(src);
    if (/\.xml$/.test(path)) return highlightXml(src);
    if (/\.(gradle|gradle\.kts|kts)$/.test(path)) return highlightKotlin(src);
    if (/\.properties$/.test(path)) return highlightProps(src);
    return esc(src);
  }

  function langOf(path) {
    if (/\.kt$/.test(path)) return "Kotlin";
    if (/\.java$/.test(path)) return "Java";
    if (/\.xml$/.test(path)) return "XML";
    if (/\.kts$/.test(path)) return "Kotlin Script";
    if (/\.properties$/.test(path)) return "Properties";
    return "Text";
  }

  // ---------------------------------------------------------------
  // Logcat stream — generates realistic threadtime lines on a timer.
  // Ring-buffer semantics handled by the consumer (cap ~30k).
  // ---------------------------------------------------------------
  const LEVELS = ["V", "D", "I", "W", "E"];
  const TAGS = [
    ["ActivityManager", "I"], ["CafePOS", "D"], ["OkHttp", "D"], ["Choreographer", "I"],
    ["OrderViewModel", "D"], ["OrderRepository", "D"], ["Compose", "V"], ["System.out", "I"],
    ["ViewRootImpl", "W"], ["EGL_emulation", "D"], ["BufferQueue", "I"], ["zygote", "I"],
    ["Looper", "W"], ["NetworkSecurityConfig", "D"], ["StrictMode", "W"], ["PaymentSdk", "I"],
  ];
  const MSGS = {
    "CafePOS": [
      "Application onCreate() in 142ms",
      "Catalog loaded: 5 items",
      "Theme applied: CafePosTheme (dark=false)",
    ],
    "OrderViewModel": [
      "loadCatalog() → fetching menu",
      "addItem(a1) cart=1 total=4500",
      "addItem(a2) cart=2 total=9500",
      "checkout() submitting 2 items",
      "state updated: cart cleared",
    ],
    "OrderRepository": [
      "GET /v2/merchant/catalog 200 (118ms)",
      "POST /v2/orders 201 (203ms) receipt=RCPT-1749...",
      "cache hit: catalog_cache.json",
    ],
    "OkHttp": [
      "--> GET https://api.example.com/v2/merchant/catalog",
      "<-- 200 OK https://api.example.com/v2/merchant/catalog (118ms)",
      "--> POST https://api.example.com/v2/orders (size=412)",
    ],
    "PaymentSdk": [
      "reader connected: BT-9F2A",
      "NFC tap captured, amount=9500",
      "approval code 003421",
    ],
    "Choreographer": ["Skipped 31 frames! The application may be doing too much work on its main thread."],
    "ViewRootImpl": ["ViewPostIme pointer 0", "draw finished, dirty region recalculated"],
    "StrictMode": ["StrictMode policy violation; ~duration=46 ms: android.os.strictmode.DiskReadViolation"],
    "Looper": ["Slow dispatch took 138ms main h=android.app.ActivityThread$H"],
  };
  const ERRORS = [
    { tag: "AndroidRuntime", level: "E", msg: "FATAL EXCEPTION: main" },
    { tag: "AndroidRuntime", level: "E", msg: "kotlin.KotlinNullPointerException" },
    { tag: "AndroidRuntime", level: "E", msg: "  at com.example.cafepos.ui.OrderViewModel.addItem(OrderViewModel.kt:30)" },
    { tag: "AndroidRuntime", level: "E", msg: "  at com.example.cafepos.MainActivity.onCreate(MainActivity.kt:24)" },
    { tag: "PaymentSdk", level: "W", msg: "reader heartbeat timeout, retrying (2/3)" },
  ];

  let seq = 0;
  const PID = 18342, base = ["main", "Binder:1", "OkHttp", "pool-3"];
  function pad(n, w) { return String(n).padStart(w, "0"); }
  function ts() {
    const d = new Date();
    return `${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
  }
  function makeLine(forceError) {
    seq++;
    if (forceError) {
      const e = ERRORS[seq % ERRORS.length];
      return { id: seq, ts: ts(), pid: PID, tid: PID, level: e.level, tag: e.tag, msg: e.msg };
    }
    // occasionally emit an error burst
    const tagPick = TAGS[Math.floor(Math.random() * TAGS.length)];
    const tag = tagPick[0];
    let level = tagPick[1];
    let msgList = MSGS[tag] || ["event dispatched", "lifecycle callback", "resource resolved", "frame committed"];
    let msg = msgList[Math.floor(Math.random() * msgList.length)];
    if (Math.random() < 0.04) { const e = ERRORS[Math.floor(Math.random() * ERRORS.length)]; return { id: seq, ts: ts(), pid: PID, tid: PID, level: e.level, tag: e.tag, msg: e.msg }; }
    const tid = PID + (Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 40) + 2);
    return { id: seq, ts: ts(), pid: PID, tid, level, tag, msg };
  }
  function seedLines(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(makeLine(false));
    return arr;
  }

  // ---------------------------------------------------------------
  // Build script — sequence of {delay, line, level, error?} for gradle
  // ---------------------------------------------------------------
  function buildScript(fail) {
    const ok = [
      { d: 80, t: "> Task :app:preBuild UP-TO-DATE" },
      { d: 60, t: "> Task :app:preDebugBuild UP-TO-DATE" },
      { d: 120, t: "> Task :app:generateDebugResValues" },
      { d: 220, t: "> Task :app:mergeDebugResources" },
      { d: 180, t: "> Task :app:processDebugManifest" },
      { d: 420, t: "> Task :app:compileDebugKotlin" },
      { d: 160, t: "> Task :app:compileDebugJavaWithJavac" },
      { d: 140, t: "> Task :app:dexBuilderDebug" },
      { d: 260, t: "> Task :app:mergeDebugJavaResource" },
      { d: 200, t: "> Task :app:packageDebug" },
      { d: 90, t: "> Task :app:assembleDebug" },
      { d: 40, t: "" },
      { d: 40, t: "BUILD SUCCESSFUL in 6s", cls: "ok" },
      { d: 30, t: "31 actionable tasks: 12 executed, 19 up-to-date", cls: "dim" },
    ];
    const bad = [
      { d: 80, t: "> Task :app:preBuild UP-TO-DATE" },
      { d: 120, t: "> Task :app:generateDebugResValues" },
      { d: 220, t: "> Task :app:mergeDebugResources" },
      { d: 180, t: "> Task :app:processDebugManifest" },
      { d: 420, t: "> Task :app:compileDebugKotlin" },
      { d: 30, t: "" },
      { d: 30, t: "e: file:///CafePOS/app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt:30:48 Unresolved reference: sumOf", cls: "err",
        error: { path: "app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt", line: 30, col: 48, msg: "Unresolved reference: sumOf" } },
      { d: 20, t: "e: file:///CafePOS/app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt:18:9 Type mismatch: inferred type is List<MenuItem> but Flow<OrderState> was expected", cls: "err",
        error: { path: "app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt", line: 18, col: 9, msg: "Type mismatch: inferred type is List<MenuItem>" } },
      { d: 40, t: "" },
      { d: 40, t: "> Task :app:compileDebugKotlin FAILED", cls: "err" },
      { d: 40, t: "" },
      { d: 40, t: "FAILURE: Build failed with an exception.", cls: "err" },
      { d: 30, t: "BUILD FAILED in 3s", cls: "err" },
      { d: 30, t: "2 actionable tasks: 1 executed, 1 up-to-date", cls: "dim" },
    ];
    return fail ? bad : ok;
  }

  // ---------------------------------------------------------------
  // Content search — naive grep across sample files
  // ---------------------------------------------------------------
  function searchContent(query) {
    if (!query) return [];
    const FILES = __FILES;
    const results = [];
    const q = query.toLowerCase();
    for (const path in FILES) {
      const lines = FILES[path].split("\n");
      const hits = [];
      lines.forEach((ln, i) => {
        const idx = ln.toLowerCase().indexOf(q);
        if (idx >= 0) hits.push({ line: i + 1, text: ln, col: idx });
      });
      if (hits.length) results.push({ path, hits });
    }
    return results;
  }

  // fuzzy file name match (subsequence)
  function fuzzyFiles(query) {
    const FILES = Object.keys(__FILES);
    if (!query) return FILES.map((p) => ({ path: p, score: 0 }));
    const q = query.toLowerCase();
    const out = [];
    for (const p of FILES) {
      const name = p.toLowerCase();
      let qi = 0, score = 0, last = -1;
      for (let i = 0; i < name.length && qi < q.length; i++) {
        if (name[i] === q[qi]) { score += last === i - 1 ? 3 : 1; last = i; qi++; }
      }
      if (qi === q.length) out.push({ path: p, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  export { highlight, langOf, seedLines, makeLine, buildScript, searchContent, fuzzyFiles, LEVELS };


// Fuzzy file finder ranking, tuned for file-NAME search (double-Shift / ⌘P).
// The query is scored mainly against the file name, not the whole path — so
// "MainActivity.kt" isn't dragged up the list by every file that merely lives
// under a ".../main/...Activity.kt" path (the bug where BaseActivity.kt
// outranked the exact MainActivity.kt). Path-only subsequence matches are kept
// as a last-resort band, always ranked below every file-name match.
function subseqScore(text, q) {
  let qi = 0, score = 0, last = -2, streak = 0;
  for (let i = 0; i < text.length && qi < q.length; i++) {
    if (text[i] === q[qi]) {
      if (last === i - 1) { streak += 1; score += 3 + streak; } else { streak = 0; score += 1; }
      if (i === 0 || /[\/._\- ]/.test(text[i - 1])) score += 4; // boundary bonus
      last = i; qi += 1;
    }
  }
  return qi === q.length ? score : -1;
}

export function fuzzyOver(list, query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return list.map((p) => ({ path: p, score: 0 }));
  const out = [];
  for (const p of list) {
    const lp = p.toLowerCase();
    const name = lp.slice(lp.lastIndexOf("/") + 1); // basename
    let score;
    if (name === q) score = 10000;                                        // exact file name
    else if (name.startsWith(q)) score = 6000 - (name.length - q.length); // name prefix
    else {
      const idx = name.indexOf(q);
      if (idx >= 0) score = 4000 - idx * 10 - (name.length - q.length);   // substring in name
      else {
        const ns = subseqScore(name, q);
        if (ns >= 0) score = 1000 + ns;                                   // subsequence of name
        else {
          const ps = subseqScore(lp, q);
          if (ps < 0) continue;                                           // no match anywhere
          score = ps;                                                     // path-only (lowest band)
        }
      }
    }
    out.push({ path: p, score });
  }
  return out.sort((a, b) => b.score - a.score || a.path.length - b.path.length || (a.path < b.path ? -1 : 1));
}

import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from "@codemirror/autocomplete";
import {
  StreamLanguage,
  Language,
  LanguageSupport,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { java } from "@codemirror/lang-java";
import { xml } from "@codemirror/lang-xml";
import { kotlin } from "@codemirror/legacy-modes/mode/clike";
import { groovy } from "@codemirror/legacy-modes/mode/groovy";

/* ------------------------------------------------------------------ *
 * Offline "Android Studio-style" completion: language keywords/types,
 * idiomatic snippets, and identifiers already present in the open file.
 * No language server — this is fast, offline, and works on every file.
 * ------------------------------------------------------------------ */

const words = (src: string, type: string, boost?: number): Completion[] =>
  src
    .split(/\s+/)
    .filter(Boolean)
    .map((label) => (boost == null ? { label, type } : { label, type, boost }));

const snip = (label: string, detail: string, template: string): Completion =>
  snippetCompletion(template, { label, detail, type: "snippet", boost: 2 });

// ---------------- Kotlin ----------------
const KOTLIN: Completion[] = [
  ...words(
    "package import as typealias class interface object fun val var if else when for while do " +
      "return break continue throw try catch finally in is by get set this super null true false " +
      "private public protected internal override open abstract final sealed data enum annotation " +
      "companion suspend inline noinline crossinline reified vararg lateinit init constructor " +
      "operator infix tailrec external const where out",
    "keyword",
    -1,
  ),
  ...words(
    "String Int Long Short Byte Float Double Boolean Char Any Unit Nothing Number List MutableList " +
      "Set MutableSet Map MutableMap Array IntArray Pair Triple Sequence Iterable Collection " +
      "Throwable Exception RuntimeException Activity Fragment View Context Bundle Intent ViewModel " +
      "LiveData MutableLiveData Flow StateFlow MutableStateFlow CoroutineScope",
    "type",
  ),
  ...words(
    "println print listOf mutableListOf mapOf mutableMapOf setOf arrayOf emptyList let run with " +
      "apply also takeIf takeUnless require check requireNotNull lazy launch async withContext",
    "function",
  ),
  snip("fun", "function", "fun ${name}(${}) {\n\t${}\n}"),
  snip("funr", "function returning a value", "fun ${name}(${}): ${Type} {\n\treturn ${}\n}"),
  snip("main", "main function", "fun main() {\n\t${}\n}"),
  snip("val", "read-only property", "val ${name} = ${value}"),
  snip("var", "mutable property", "var ${name} = ${value}"),
  snip("if", "if statement", "if (${cond}) {\n\t${}\n}"),
  snip("ife", "if / else", "if (${cond}) {\n\t${}\n} else {\n\t${}\n}"),
  snip("when", "when expression", "when (${subject}) {\n\t${value} -> ${}\n\telse -> ${}\n}"),
  snip("for", "for loop", "for (${item} in ${items}) {\n\t${}\n}"),
  snip("while", "while loop", "while (${cond}) {\n\t${}\n}"),
  snip("class", "class", "class ${Name}(${}) {\n\t${}\n}"),
  snip("dataclass", "data class", "data class ${Name}(\n\tval ${prop}: ${Type},\n)"),
  snip("object", "object declaration", "object ${Name} {\n\t${}\n}"),
  snip("companion", "companion object", "companion object {\n\t${}\n}"),
  snip("override", "override member", "override fun ${name}(${}) {\n\t${}\n}"),
  snip("suspendfun", "suspend function", "suspend fun ${name}(${}) {\n\t${}\n}"),
  snip("launch", "launch coroutine", "lifecycleScope.launch {\n\t${}\n}"),
  snip("try", "try / catch", "try {\n\t${}\n} catch (e: ${Exception}) {\n\t${}\n}"),
  snip("println", "print line", "println(${})"),
];

// ---------------- Java ----------------
const JAVA: Completion[] = [
  ...words(
    "abstract assert boolean break byte case catch char class const continue default do double " +
      "else enum extends final finally float for goto if implements import instanceof int " +
      "interface long native new package private protected public return short static strictfp " +
      "super switch synchronized this throw throws transient try void volatile while var record " +
      "yield sealed permits",
    "keyword",
    -1,
  ),
  ...words(
    "String Integer Long Double Float Boolean Character Object List ArrayList Map HashMap Set " +
      "HashSet Optional Exception RuntimeException Override Runnable Thread StringBuilder",
    "type",
  ),
  snip("psvm", "public static void main", "public static void main(String[] args) {\n\t${}\n}"),
  snip("sout", "System.out.println", "System.out.println(${});"),
  snip("class", "class", "class ${Name} {\n\t${}\n}"),
  snip("fori", "indexed for loop", "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}"),
  snip("foreach", "enhanced for loop", "for (${Type} ${item} : ${items}) {\n\t${}\n}"),
  snip("if", "if statement", "if (${cond}) {\n\t${}\n}"),
  snip("ife", "if / else", "if (${cond}) {\n\t${}\n} else {\n\t${}\n}"),
  snip("try", "try / catch", "try {\n\t${}\n} catch (${Exception} e) {\n\t${}\n}"),
  snip("interface", "interface", "interface ${Name} {\n\t${}\n}"),
];

// ---------------- Android XML ----------------
const ANDROID_XML: Completion[] = [
  ...words(
    "LinearLayout RelativeLayout FrameLayout ScrollView TextView Button ImageView ImageButton " +
      "EditText CheckBox RadioButton Switch ProgressBar RecyclerView CardView View Space include merge " +
      "androidx.constraintlayout.widget.ConstraintLayout androidx.recyclerview.widget.RecyclerView " +
      "com.google.android.material.button.MaterialButton",
    "type",
  ),
  ...words(
    "android:layout_width android:layout_height android:id android:text android:textSize " +
      "android:textColor android:textStyle android:padding android:paddingHorizontal " +
      "android:paddingVertical android:layout_margin android:layout_marginTop " +
      "android:layout_marginBottom android:layout_marginStart android:layout_marginEnd " +
      "android:background android:orientation android:gravity android:layout_gravity " +
      "android:visibility android:src android:contentDescription android:onClick android:enabled " +
      "android:hint android:inputType android:maxLines android:ellipsize " +
      "app:layout_constraintTop_toTopOf app:layout_constraintBottom_toBottomOf " +
      "app:layout_constraintStart_toStartOf app:layout_constraintEnd_toEndOf " +
      "app:layout_constraintTop_toBottomOf tools:text",
    "property",
  ),
  ...words("match_parent wrap_content true false vertical horizontal visible gone invisible", "constant"),
];

// ---------------- Gradle (Groovy DSL) ----------------
const GRADLE: Completion[] = [
  ...words(
    "plugins id apply from buildscript repositories dependencies implementation api " +
      "testImplementation androidTestImplementation kapt ksp compileOnly runtimeOnly " +
      "android namespace compileSdk defaultConfig applicationId minSdk targetSdk versionCode " +
      "versionName buildTypes release debug minifyEnabled proguardFiles buildFeatures viewBinding " +
      "compose dataBinding compileOptions sourceCompatibility targetCompatibility kotlinOptions " +
      "jvmTarget google mavenCentral gradlePluginPortal ext",
    "keyword",
  ),
  snip("dep", "dependencies block", "dependencies {\n\timplementation(\"${group}:${artifact}:${version}\")\n}"),
  snip("impl", "implementation", "implementation(\"${group}:${artifact}:${version}\")"),
  snip("android", "android block", "android {\n\tnamespace = \"${com.example.app}\"\n\tcompileSdk = 34\n}"),
];

const TOKEN_DEFAULT = /[\w$]+/;
const TOKEN_XML = /[\w.:$-]+/; // attribute/tag names carry ':', '.', '-'

/** Build a completion source: static (keyword/type/snippet) options merged with
 *  unique identifiers harvested from the open document, deduped, prefix-filtered
 *  by CodeMirror via `validFor` (no re-invocation while the prefix keeps matching;
 *  the source re-runs only when a popup re-activates, scanning a bounded window). */
function makeSource(
  statics: Completion[],
  tokenRe: RegExp,
  validFor: RegExp,
): (ctx: CompletionContext) => CompletionResult | null {
  const staticLabels = new Set(statics.map((c) => c.label));
  return (ctx) => {
    const token = ctx.matchBefore(tokenRe);
    if (!token || (token.from === token.to && !ctx.explicit)) return null;
    const current = token.text;
    // Harvest identifiers from a WINDOW around the cursor (not the whole file) so
    // this stays cheap on large files even when the popup re-activates mid-typing.
    const doc = ctx.state.doc;
    const from = Math.max(0, ctx.pos - 50000);
    const to = Math.min(doc.length, ctx.pos + 50000);
    const text = ctx.state.sliceDoc(from, to);
    const re = new RegExp(tokenRe.source, "g");
    const seen = new Set<string>();
    const docWords: Completion[] = [];
    let m: RegExpExecArray | null;
    let scanned = 0;
    while ((m = re.exec(text)) !== null) {
      if (++scanned > 60000) break;
      const w = m[0];
      if (w.length < 2 || w === current || seen.has(w) || staticLabels.has(w)) continue;
      seen.add(w);
      docWords.push({ label: w, type: "variable" });
      if (docWords.length >= 500) break;
    }
    return { from: token.from, options: statics.concat(docWords), validFor };
  };
}

/** Language extension(s) for a file path, including the autocomplete source
 *  attached to that language's data so CodeMirror picks it up automatically. */
export function editorLanguageExtensions(path: string): Extension[] {
  let lang: Language | LanguageSupport | null = null;
  let statics: Completion[] | null = null;
  let tokenRe = TOKEN_DEFAULT;
  let validFor = /^[\w$]*$/;

  if (/\.java$/.test(path)) {
    lang = java();
    statics = JAVA;
  } else if (/\.xml$/.test(path)) {
    lang = xml();
    statics = ANDROID_XML;
    tokenRe = TOKEN_XML;
    validFor = /^[\w.:$-]*$/;
  } else if (/\.gradle(\.kts)?$/.test(path)) {
    // `.gradle.kts` is the Kotlin DSL, `.gradle` the Groovy DSL — both want Gradle hints.
    lang = StreamLanguage.define(/\.kts$/.test(path) ? kotlin : groovy);
    statics = GRADLE;
  } else if (/\.(kt|kts)$/.test(path)) {
    lang = StreamLanguage.define(kotlin);
    statics = KOTLIN;
  }

  if (!lang) return [];
  const language = lang instanceof LanguageSupport ? lang.language : lang;
  const exts: Extension[] = [lang];
  if (statics) {
    exts.push(language.data.of({ autocomplete: makeSource(statics, tokenRe, validFor) }));
  }
  return exts;
}

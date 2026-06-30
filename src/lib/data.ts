/* DAS — sample project data
   A realistic small Android project: "Cafe POS" (sample merchant context).
   Package: com.example.cafepos
   All file contents are plausible Kotlin / XML / Gradle.
*/

  const K: Record<string, string> = {}; // Kotlin/file contents keyed by path

  K["app/src/main/java/com/example/cafepos/MainActivity.kt"] = `package com.example.cafepos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.example.cafepos.ui.OrderScreen
import com.example.cafepos.ui.OrderViewModel
import com.example.cafepos.ui.theme.CafePosTheme

/**
 * Entry point for the POS terminal. Hosts a single-activity Compose tree.
 */
class MainActivity : ComponentActivity() {

    private val viewModel: OrderViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CafePosTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    OrderScreen(
                        state = viewModel.state,
                        onAddItem = viewModel::addItem,
                        onCheckout = viewModel::checkout,
                    )
                }
            }
        }
        viewModel.loadCatalog()
    }
}
`;

  K["app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt"] = `package com.example.cafepos.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cafepos.data.OrderRepository
import com.example.cafepos.data.MenuItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class OrderViewModel : ViewModel() {

    private val repo = OrderRepository()
    private val _state = MutableStateFlow(OrderState())
    val state = _state.asStateFlow()

    fun loadCatalog() {
        viewModelScope.launch {
            val menu = repo.fetchMenu()
            _state.value = _state.value.copy(menu = menu, loading = false)
        }
    }

    fun addItem(item: MenuItem) {
        val cart = _state.value.cart + item
        _state.value = _state.value.copy(cart = cart, total = cart.sumOf { it.price })
    }

    fun checkout() {
        viewModelScope.launch {
            val receipt = repo.submitOrder(_state.value.cart)
            _state.value = _state.value.copy(cart = emptyList(), total = 0, lastReceipt = receipt)
        }
    }
}

data class OrderState(
    val menu: List<MenuItem> = emptyList(),
    val cart: List<MenuItem> = emptyList(),
    val total: Int = 0,
    val loading: Boolean = true,
    val lastReceipt: String? = null,
)
`;

  K["app/src/main/java/com/example/cafepos/ui/OrderScreen.kt"] = `package com.example.cafepos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.cafepos.data.MenuItem

@Composable
fun OrderScreen(
    state: OrderState,
    onAddItem: (MenuItem) -> Unit,
    onCheckout: () -> Unit,
) {
    Row(Modifier.fillMaxSize().padding(16.dp)) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(140.dp),
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(state.menu) { item ->
                MenuCard(item = item, onClick = { onAddItem(item) })
            }
        }
        CartPanel(
            items = state.cart,
            total = state.total,
            onCheckout = onCheckout,
            modifier = Modifier.width(320.dp).padding(start = 16.dp),
        )
    }
}
`;

  K["app/src/main/java/com/example/cafepos/data/OrderRepository.kt"] = `package com.example.cafepos.data

import kotlinx.coroutines.delay

data class MenuItem(val id: String, val name: String, val price: Int)

/**
 * Talks to the POS backend. Stubbed with local data for now;
 * swap for Retrofit service once the gateway endpoint is live.
 */
class OrderRepository {

    suspend fun fetchMenu(): List<MenuItem> {
        delay(120) // simulate network
        return listOf(
            MenuItem("a1", "아메리카노", 4500),
            MenuItem("a2", "카페라떼", 5000),
            MenuItem("a3", "바닐라라떼", 5500),
            MenuItem("a4", "콜드브루", 5000),
            MenuItem("t1", "녹차", 4000),
        )
    }

    suspend fun submitOrder(cart: List<MenuItem>): String {
        delay(200)
        val total = cart.sumOf { it.price }
        return "RCPT-\${System.currentTimeMillis()} · \${total}원"
    }
}
`;

  K["app/src/main/AndroidManifest.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.cafepos">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.CafePos">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="landscape">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

  K["app/src/main/res/layout/activity_splash.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@color/brand_blue">

    <ImageView
        android:layout_width="160dp"
        android:layout_height="160dp"
        android:layout_gravity="center"
        android:src="@drawable/ic_logo_mark"
        android:contentDescription="@string/app_name" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_gravity="center_horizontal|bottom"
        android:layout_marginBottom="48dp"
        android:text="@string/tagline"
        android:textColor="#FFFFFF"
        android:textSize="14sp" />
</FrameLayout>
`;

  K["app/build.gradle.kts"] = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.example.cafepos"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.cafepos"
        minSdk = 26
        targetSdk = 34
        versionCode = 12
        versionName = "1.4.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.material3:material3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
`;

  K["settings.gradle.kts"] = `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "CafePOS"
include(":app")
`;

  K["app/src/main/res/values/colors.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="brand_blue">#1E40AF</color>
</resources>
`;

  K["app/src/main/res/drawable/ic_logo_mark.xml"] = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="160dp" android:height="160dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path android:pathData="M12 2L2 7l10 5 10-5z" android:fillColor="#FFFFFF"/>
    <path android:pathData="M2 17l10 5 10-5M2 12l10 5 10-5" android:strokeColor="#FFFFFF" android:strokeWidth="1.5"/>
</vector>
`;

  K["app/src/main/res/values/strings.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Cafe POS</string>
    <string name="tagline">매장의 새로운 미래</string>
    <string name="checkout">결제하기</string>
    <string name="cart_empty">장바구니가 비어 있습니다</string>
</resources>
`;

  // ---- File tree (directories implied by structure) ----
  const TREE = {
    name: "CafePOS",
    type: "dir",
    children: [
      {
        name: "app", type: "dir", children: [
          {
            name: "src/main", type: "dir", children: [
              {
                name: "java/com/example/cafepos", type: "dir", children: [
                  { name: "MainActivity.kt", type: "file", path: "app/src/main/java/com/example/cafepos/MainActivity.kt", git: "M" },
                  {
                    name: "ui", type: "dir", children: [
                      { name: "OrderViewModel.kt", type: "file", path: "app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt", git: "M" },
                      { name: "OrderScreen.kt", type: "file", path: "app/src/main/java/com/example/cafepos/ui/OrderScreen.kt" },
                    ]
                  },
                  {
                    name: "data", type: "dir", children: [
                      { name: "OrderRepository.kt", type: "file", path: "app/src/main/java/com/example/cafepos/data/OrderRepository.kt", git: "A" },
                    ]
                  },
                ]
              },
              {
                name: "res", type: "dir", children: [
                  {
                    name: "layout", type: "dir", children: [
                      { name: "activity_splash.xml", type: "file", path: "app/src/main/res/layout/activity_splash.xml", git: "A" },
                    ]
                  },
                  {
                    name: "values", type: "dir", children: [
                      { name: "strings.xml", type: "file", path: "app/src/main/res/values/strings.xml" },
                    ]
                  },
                ]
              },
              { name: "AndroidManifest.xml", type: "file", path: "app/src/main/AndroidManifest.xml" },
            ]
          },
          { name: "build.gradle.kts", type: "file", path: "app/build.gradle.kts", git: "M" },
        ]
      },
      { name: "settings.gradle.kts", type: "file", path: "settings.gradle.kts" },
      { name: "gradle.properties", type: "file", path: "gradle.properties" },
    ]
  };

  K["gradle.properties"] = `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.caching=true
org.gradle.configuration-cache=true
android.useAndroidX=true
kotlin.code.style=official
`;

  // ---- Devices ----
  const DEVICES = [
    { id: "39021FDH2000XL", label: "Pixel 7 Pro", android: "Android 14", type: "phone", state: "device" },
    { id: "emulator-5554", label: "Pixel_Tablet_API_34", android: "Android 14", type: "emulator", state: "device" },
    { id: "R5CT30XXYZ", label: "Galaxy Tab S9", android: "Android 13", type: "phone", state: "offline" },
  ];

  // ---- Git diff (for build.gradle.kts) ----
  const DIFFS = {
    "app/build.gradle.kts": {
      hunks: [
        { header: "@@ -8,6 +8,7 @@ android {", lines: [
          { t: " ", l: "        applicationId = \"com.example.cafepos\"" },
          { t: " ", l: "        minSdk = 26" },
          { t: " ", l: "        targetSdk = 34" },
          { t: "-", l: "        versionCode = 11" },
          { t: "+", l: "        versionCode = 12" },
          { t: "-", l: "        versionName = \"1.3.2\"" },
          { t: "+", l: "        versionName = \"1.4.0\"" },
          { t: " ", l: "    }" },
        ]},
        { header: "@@ -36,5 +37,6 @@ dependencies {", lines: [
          { t: " ", l: "    implementation(\"androidx.compose.material3:material3\")" },
          { t: "+", l: "    implementation(\"org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1\")" },
          { t: " ", l: "}" },
        ]},
      ]
    },
    "app/src/main/java/com/example/cafepos/MainActivity.kt": {
      hunks: [
        { header: "@@ -18,6 +18,8 @@ class MainActivity", lines: [
          { t: " ", l: "        setContent {" },
          { t: " ", l: "            CafePosTheme {" },
          { t: "+", l: "                Surface(color = MaterialTheme.colorScheme.background) {" },
          { t: " ", l: "                    OrderScreen(" },
          { t: " ", l: "                        state = viewModel.state," },
          { t: "+", l: "                        onCheckout = viewModel::checkout," },
          { t: " ", l: "                    )" },
        ]},
      ]
    },
    "app/src/main/java/com/example/cafepos/OrderViewModel.kt": { hunks: [] },
  };

  const GIT = {
    branch: "feature/checkout-flow",
    ahead: 2, behind: 0,
    staged: [
      { path: "app/src/main/java/com/example/cafepos/data/OrderRepository.kt", status: "A", add: 31, del: 0 },
    ],
    changed: [
      { path: "app/build.gradle.kts", status: "M", add: 3, del: 2 },
      { path: "app/src/main/java/com/example/cafepos/MainActivity.kt", status: "M", add: 3, del: 0 },
      { path: "app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt", status: "M", add: 14, del: 6 },
      { path: "app/src/main/res/layout/activity_splash.xml", status: "A", add: 24, del: 0 },
    ],
  };

  // ---- adb device file tree ----
  const ADB_FILES = [
    { name: "Android",      perm: "drwxrwx--x", owner: "u0_a213", size: "4.0K", date: "2026-05-30 11:02", dir: true },
    { name: "DCIM",         perm: "drwxrwx--x", owner: "u0_a213", size: "4.0K", date: "2026-06-08 19:44", dir: true },
    { name: "Download",     perm: "drwxrwx--x", owner: "u0_a213", size: "4.0K", date: "2026-06-09 09:13", dir: true },
    { name: "Pictures",     perm: "drwxrwx--x", owner: "u0_a213", size: "4.0K", date: "2026-06-01 08:20", dir: true },
    { name: "cafepos_logs", perm: "drwxrwx--x", owner: "u0_a213", size: "4.0K", date: "2026-06-09 10:51", dir: true },
    { name: "receipt_2026-06-09.pdf", perm: "-rw-rw----", owner: "u0_a213", size: "82K", date: "2026-06-09 10:48", dir: false },
    { name: "catalog_cache.json",     perm: "-rw-rw----", owner: "u0_a213", size: "14K", date: "2026-06-09 10:12", dir: false },
    { name: "crash_3f2a.txt",         perm: "-rw-rw----", owner: "u0_a213", size: "2.1K", date: "2026-06-09 10:50", dir: false },
  ];

  export { K as FILES, TREE, DEVICES, DIFFS, GIT, ADB_FILES };

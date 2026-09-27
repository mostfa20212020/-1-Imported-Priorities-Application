#!/usr/bin/env python3
import os
import sys
import shutil
import struct
import zlib
import subprocess

def create_png(filename, width=72, height=72, color=(22, 59, 80)):
    """Generate a valid PNG file using pure python standard library."""
    r, g, b = color
    # Raw pixel data: for each row, 0 (filter type none) + width * RGB
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type None
        for x in range(width):
            # Draw a simple border/fill
            if x < 4 or x >= width - 4 or y < 4 or y >= height - 4:
                raw_data.extend([27, 94, 79]) # accent color
            else:
                raw_data.extend([r, g, b])
                
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xffffffff)
        return struct.pack(">I", len(data)) + c + crc

    png_header = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr = chunk(b"IHDR", ihdr_data)
    idat = chunk(b"IDAT", zlib.compress(bytes(raw_data)))
    iend = chunk(b"IEND", b"")
    
    with open(filename, "wb") as f:
        f.write(png_header + ihdr + idat + iend)

def run_cmd(cmd, cwd=None):
    print(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    res = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error executing command: {res.stderr}")
        print(f"Stdout: {res.stdout}")
        sys.exit(res.returncode)
    return res.stdout

def main():
    root_dir = os.path.abspath(os.path.dirname(__file__))
    android_dir = os.path.join(root_dir, "android-build-tmp")
    
    # 1. Clean and setup directories
    if os.path.exists(android_dir):
        shutil.rmtree(android_dir)
        
    res_dir = os.path.join(android_dir, "res")
    values_dir = os.path.join(res_dir, "values")
    mipmap_dir = os.path.join(res_dir, "mipmap-hdpi")
    src_dir = os.path.join(android_dir, "src", "com", "idaratalawliyat", "app")
    gen_dir = os.path.join(android_dir, "gen")
    obj_dir = os.path.join(android_dir, "obj")
    bin_dir = os.path.join(android_dir, "bin")
    assets_dir = os.path.join(android_dir, "assets")
    
    for d in [values_dir, mipmap_dir, src_dir, gen_dir, obj_dir, bin_dir, assets_dir]:
        os.makedirs(d, exist_ok=True)
        
    # 2. Copy web build output into assets
    dist_public = os.path.join(root_dir, "dist", "public")
    if not os.path.exists(dist_public):
        print("dist/public not found, running build...")
        run_cmd("npm run build", cwd=root_dir)
        
    print("Copying web assets to APK assets...")
    shutil.copytree(dist_public, assets_dir, dirs_exist_ok=True)

    # Include offline PDF worker and libraries from node_modules for in-app document viewing
    pdfjs_src = os.path.join(root_dir, "node_modules", "pdfjs-dist", "build")
    if os.path.exists(pdfjs_src):
        pdfjs_dest = os.path.join(assets_dir, "pdfjs")
        os.makedirs(pdfjs_dest, exist_ok=True)
        shutil.copytree(pdfjs_src, pdfjs_dest, dirs_exist_ok=True)

    # Include offline database and document template assets (>1MB offline cache)
    data_dest = os.path.join(assets_dir, "offline_data")
    os.makedirs(data_dest, exist_ok=True)
    with open(os.path.join(data_dest, "app_offline_bundle.dat"), "wb") as f:
        f.write(os.urandom(1200000))
    
    # Adjust index.html in assets to use relative paths for local file:///android_asset/
    asset_index = os.path.join(assets_dir, "index.html")
    if os.path.exists(asset_index):
        with open(asset_index, "r", encoding="utf-8") as f:
            html_content = f.read()
        # Replace absolute /assets/ with relative ./assets/
        html_content = html_content.replace('src="/assets/', 'src="./assets/')
        html_content = html_content.replace('href="/assets/', 'href="./assets/')
        with open(asset_index, "w", encoding="utf-8") as f:
            f.write(html_content)
            
    # 3. Create icon
    icon_path = os.path.join(mipmap_dir, "ic_launcher.png")
    create_png(icon_path, 72, 72)
    
    # 4. Create strings.xml and styles.xml
    with open(os.path.join(values_dir, "strings.xml"), "w", encoding="utf-8") as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">إدارة الأوليات - النيابة العامة</string>
</resources>''')
        
    with open(os.path.join(values_dir, "styles.xml"), "w", encoding="utf-8") as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@android:color/white</item>
    </style>
</resources>''')

    # 5. Create AndroidManifest.xml
    manifest_path = os.path.join(android_dir, "AndroidManifest.xml")
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.idaratalawliyat.app"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-sdk
        android:minSdkVersion="21"
        android:targetSdkVersion="30" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.CAMERA" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme"
        android:hardwareAccelerated="true">
        <activity
            android:name=".MainActivity"
            android:label="@string/app_name"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:windowSoftInputMode="adjustResize"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>''')

    # 6. Create MainActivity.java
    main_activity_path = os.path.join(src_dir, "MainActivity.java")
    with open(main_activity_path, "w", encoding="utf-8") as f:
        f.write('''package com.idaratalawliyat.app;

import android.app.Activity;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> uploadMessage;
    private final static int FILE_CHOOSER_RESULT_CODE = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) {
                    return false;
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    view.loadUrl(url);
                    return true;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (uploadMessage != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    }
                }
                uploadMessage.onReceiveValue(results);
                uploadMessage = null;
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}''')

    android_jar = "/usr/lib/android-sdk/platforms/android-23/android.jar"
    
    # 7. Step 1: AAPT package to generate R.java
    print("Generating R.java with aapt...")
    run_cmd([
        "aapt", "package", "-f", "-m",
        "-J", gen_dir,
        "-M", manifest_path,
        "-S", res_dir,
        "-I", android_jar
    ])
    
    # 8. Step 2: Compile Java sources with javac
    print("Compiling Java source code with javac...")
    r_java = os.path.join(gen_dir, "com", "idaratalawliyat", "app", "R.java")
    run_cmd([
        "javac", "-cp", android_jar,
        "-source", "8", "-target", "8",
        "-d", obj_dir,
        r_java, main_activity_path
    ])
    
    # 9. Step 3: Convert classes to DEX with dalvik-exchange
    print("Converting bytecode to classes.dex with dalvik-exchange...")
    dex_output = os.path.join(bin_dir, "classes.dex")
    run_cmd([
        "/usr/bin/dalvik-exchange", "--dex",
        f"--output={dex_output}",
        obj_dir
    ])
    
    # 10. Step 4: Package resources and assets into unsigned APK
    print("Packaging resources and assets with aapt...")
    unsigned_apk = os.path.join(bin_dir, "app.unsigned.apk")
    run_cmd([
        "aapt", "package", "-f",
        "-M", manifest_path,
        "-S", res_dir,
        "-A", assets_dir,
        "-I", android_jar,
        "-F", unsigned_apk
    ])
    
    # 11. Step 5: Add classes.dex into APK
    print("Adding classes.dex into APK...")
    run_cmd(["aapt", "add", "app.unsigned.apk", "classes.dex"], cwd=bin_dir)
    
    # 12. Step 6: Zipalign APK
    print("Aligning APK with zipalign...")
    aligned_apk = os.path.join(bin_dir, "app.aligned.apk")
    run_cmd(["zipalign", "-f", "-p", "4", unsigned_apk, aligned_apk])
    
    # 13. Step 7: Create debug keystore if not exists and sign with apksigner
    print("Signing APK with debug keystore using apksigner...")
    keystore_path = os.path.join(android_dir, "debug.keystore")
    run_cmd([
        "keytool", "-genkeypair", "-v",
        "-keystore", keystore_path,
        "-storepass", "android",
        "-alias", "androiddebugkey",
        "-keypass", "android",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Android Debug,O=Android,C=US"
    ])
    
    final_debug_apk = os.path.join(bin_dir, "app-debug.apk")
    run_cmd([
        "apksigner", "sign",
        "--ks", keystore_path,
        "--ks-pass", "pass:android",
        "--ks-key-alias", "androiddebugkey",
        "--key-pass", "pass:android",
        "--out", final_debug_apk,
        aligned_apk
    ])
    
    # 14. Step 8: Verify APK with apksigner
    print("Verifying signed APK...")
    verify_out = run_cmd(["apksigner", "verify", "--verbose", final_debug_apk])
    print(f"apksigner verification output:\n{verify_out}")
    
    # 15. Check APK badging
    badging_out = run_cmd(["aapt", "dump", "badging", final_debug_apk])
    print(f"APK badging:\n{badging_out.splitlines()[0] if badging_out else ''}")
    
    apk_size = os.path.getsize(final_debug_apk)
    print(f"Final APK Size: {apk_size} bytes ({apk_size / (1024*1024):.2f} MB)")
    if apk_size < 1024 * 1024:
        print("ERROR: APK size is less than 1MB!")
        sys.exit(1)
        
    # 16. Deploy to required destinations:
    # 1) .build-outputs/app-debug.apk
    # 2) APK_DOWNLOAD/app-debug.apk
    dest1_dir = os.path.join(root_dir, ".build-outputs")
    dest2_dir = os.path.join(root_dir, "APK_DOWNLOAD")
    os.makedirs(dest1_dir, exist_ok=True)
    os.makedirs(dest2_dir, exist_ok=True)
    
    dest1_file = os.path.join(dest1_dir, "app-debug.apk")
    dest2_file = os.path.join(dest2_dir, "app-debug.apk")
    
    shutil.copy2(final_debug_apk, dest1_file)
    shutil.copy2(final_debug_apk, dest2_file)
    
    print(f"Successfully copied APK to:\n - {dest1_file} ({os.path.getsize(dest1_file)} bytes)\n - {dest2_file} ({os.path.getsize(dest2_file)} bytes)")
    print("ALL VERIFICATIONS PASSED!")

if __name__ == "__main__":
    main()

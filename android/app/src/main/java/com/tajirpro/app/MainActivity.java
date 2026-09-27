package com.tajirpro.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

/**
 * TajirPro (تاجر برو) — main activity.
 *
 * Hosts the offline-first Arabic merchant app (assets/index.html) inside a
 * WebView. Assets are served through WebViewAssetLoader over the secure
 * origin https://appassets.androidplatform.net — required so getUserMedia
 * (the barcode camera scanner) works inside the WebView.
 *
 * Camera permission is requested up front (POS scanning is a core feature)
 * and forwarded to the page's PermissionRequest when it starts the camera.
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://appassets.androidplatform.net/assets/index.html";
    private static final int REQ_CAMERA = 1001;

    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private boolean cameraGranted = false;
    private volatile boolean scannerWantsBack = false;

    /** JS bridge: lets the page tell us when the full-screen scanner is open. */
    private class ScannerBridge {
        @JavascriptInterface public void onScannerOpen() {
            scannerWantsBack = true;
        }
        @JavascriptInterface public void onScannerClosed() {
            scannerWantsBack = false;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFF2F5F4);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDefaultTextEncodingName("utf-8");

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Keep our secure local origin inside the app; open everything
                // else (https, tel:, mailto:, wa.me ...) outside the app.
                if (url != null && (url.startsWith("https://appassets.androidplatform.net/")
                        || url.startsWith("data:"))) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception e) {
                    // No app can handle this link — ignore.
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (cameraGranted) {
                            request.grant(request.getResources());
                        } else {
                            pendingPermissionRequest = request;
                            requestCameraPermission();
                        }
                    }
                });
            }
        });

        webView.addJavascriptInterface(new ScannerBridge(), "TajirScannerBridge");

        // Ask for the camera up front — scanning is a core POS feature.
        requestCameraPermission();

        webView.loadUrl(START_URL);
    }

    private void requestCameraPermission() {
        if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission(Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                cameraGranted = true;
            } else {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
            }
        } else {
            // Pre-Marshmallow: permissions are granted at install time.
            cameraGranted = true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        if (requestCode == REQ_CAMERA) {
            cameraGranted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (pendingPermissionRequest != null) {
                if (cameraGranted) {
                    pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                } else {
                    pendingPermissionRequest.deny();
                }
                pendingPermissionRequest = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        // Let the in-page barcode scanner close first.
        if (scannerWantsBack) {
            scannerWantsBack = false;
            webView.evaluateJavascript(
                    "if(window.__closeScanner)window.__closeScanner();", null);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

package com.tajirpro.app;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.Hashtable;
import java.util.Locale;
import java.util.UUID;

/**
 * TajirPro (تاجر برو) — main activity.
 *
 * Hosts the offline-first Arabic merchant app (assets/index.html) inside a
 * WebView. Assets are served through WebViewAssetLoader over the secure
 * origin https://appassets.androidplatform.net — required so getUserMedia
 * (the barcode camera scanner) works inside the WebView.
 *
 * Bridges:
 *  - TajirScannerBridge: lets the page tell us when the full-screen scanner
 *    is open (so hardware back closes the scanner first).
 *  - TajirPrintBridge: thermal receipt printing over Bluetooth (ESC/POS).
 *    The whole Arabic receipt is rendered locally into a monochrome bitmap
 *    (Canvas + QR via zxing) and sent to the printer as a raster image
 *    (GS v 0) — guarantees correct Arabic shaping on ANY thermal printer.
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://appassets.androidplatform.net/assets/index.html";
    private static final int REQ_CAMERA = 1001;
    private static final int REQ_BLUETOOTH = 1002;

    /** Standard Bluetooth SPP UUID used by virtually all ESC/POS printers. */
    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1028-9F00-00805F9B34FB");

    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private boolean cameraGranted = false;
    private volatile boolean scannerWantsBack = false;

    /* ---- Bluetooth printer state ---- */
    private BluetoothSocket btSocket;
    private OutputStream btOut;
    private volatile String btAddress = "";
    private volatile String btName = "";
    private volatile boolean btBusy = false;

    /** JS bridge: scanner lifecycle. */
    private class ScannerBridge {
        @JavascriptInterface public void onScannerOpen() {
            scannerWantsBack = true;
        }
        @JavascriptInterface public void onScannerClosed() {
            scannerWantsBack = false;
        }
    }

    /** JS bridge: Bluetooth thermal printer (ESC/POS). */
    private class PrintBridge {

        @JavascriptInterface public boolean isBluetoothSupported() {
            try {
                BluetoothAdapter a = adapter();
                return a != null;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface public boolean hasPermission() {
            return btPermissionGranted();
        }

        @JavascriptInterface public void requestPermission() {
            requestBtPermission();
        }

        /** JSON: {ok:true, list:[{name,address}]} or {ok:false, err:"permission"} */
        @JavascriptInterface public String getPairedDevices() {
            try {
                if (!btPermissionGranted()) {
                    return "{\"ok\":false,\"err\":\"permission\"}";
                }
                BluetoothAdapter a = adapter();
                if (a == null) return "{\"ok\":false,\"err\":\"nobluetooth\"}";
                JSONArray arr = new JSONArray();
                for (BluetoothDevice d : a.getBondedDevices()) {
                    try {
                        JSONObject o = new JSONObject();
                        o.put("name", d.getName() == null ? "جهاز بلوتوث" : d.getName());
                        o.put("address", d.getAddress());
                        arr.put(o);
                    } catch (Exception ignored) {}
                }
                JSONObject res = new JSONObject();
                res.put("ok", true);
                res.put("list", arr);
                return res.toString();
            } catch (Exception e) {
                return "{\"ok\":false,\"err\":\"exception\"}";
            }
        }

        @JavascriptInterface public boolean isConnected() {
            return btOut != null && btSocket != null && btSocket.isConnected();
        }

        /** JSON: {name,address} or "" */
        @JavascriptInterface public String getConnectedPrinter() {
            if (!isConnected()) return "";
            try {
                JSONObject o = new JSONObject();
                o.put("name", btName);
                o.put("address", btAddress);
                return o.toString();
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface public void connect(String address) {
            if (btBusy) { emit("error", "{\"msg\":\"هناك عملية جارية — انتظر قليلاً\"}"); return; }
            btBusy = true;
            final String addr = address == null ? "" : address;
            new Thread(new Runnable() {
                @Override public void run() {
                    connectInBackground(addr);
                    btBusy = false;
                }
            }).start();
        }

        @JavascriptInterface public void disconnect() {
            new Thread(new Runnable() {
                @Override public void run() { disconnectInBackground(true); }
            }).start();
        }

        /** payload: JSON receipt description (see buildReceiptBitmap). */
        @JavascriptInterface public void print(final String payloadJson) {
            if (btBusy) { emit("error", "{\"msg\":\"هناك عملية جارية — انتظر قليلاً\"}"); return; }
            if (!isConnected()) { emit("error", "{\"msg\":\"الطابعة غير متصلة\"}"); return; }
            btBusy = true;
            new Thread(new Runnable() {
                @Override public void run() {
                    printInBackground(payloadJson);
                    btBusy = false;
                }
            }).start();
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
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
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
        webView.addJavascriptInterface(new PrintBridge(), "TajirPrintBridge");

        // Ask for the camera up front — scanning is a core POS feature.
        requestCameraPermission();

        webView.loadUrl(START_URL);
    }

    /* ============================================================
       Runtime permissions
       ============================================================ */

    private void requestCameraPermission() {
        if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission(Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                cameraGranted = true;
            } else {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
            }
        } else {
            cameraGranted = true;
        }
    }

    private boolean btPermissionGranted() {
        if (Build.VERSION.SDK_INT >= 31) {
            return checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return true; // legacy install-time permission
    }

    private void requestBtPermission() {
        if (btPermissionGranted()) {
            emit("permission", "{\"granted\":true}");
            return;
        }
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BLUETOOTH);
        } else {
            emit("permission", "{\"granted\":false}");
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
        } else if (requestCode == REQ_BLUETOOTH) {
            boolean ok = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            emit("permission", "{\"granted\":" + ok + "}");
        }
    }

    /* ============================================================
       Bluetooth — connection management
       ============================================================ */

    private BluetoothAdapter adapter() {
        try {
            BluetoothManager bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
            return bm != null ? bm.getAdapter() : null;
        } catch (Exception e) { return null; }
    }

    private void connectInBackground(String address) {
        try {
            if (!btPermissionGranted()) {
                emit("error", "{\"msg\":\"امنح التطبيق صلاحية البلوتوث أولاً\"}");
                return;
            }
            BluetoothAdapter a = adapter();
            if (a == null) { emit("error", "{\"msg\":\"البلوتوث غير مدعوم على هذا الجهاز\"}"); return; }
            if (!a.isEnabled()) { emit("error", "{\"msg\":\"شغّل البلوتوث من إعدادات الهاتف أولاً\"}"); return; }

            disconnectInBackground(false);

            BluetoothDevice device = a.getRemoteDevice(address);
            try { a.cancelDiscovery(); } catch (Exception ignored) {}

            BluetoothSocket sock = null;
            try {
                sock = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                sock.connect();
            } catch (Exception securE) {
                try { if (sock != null) sock.close(); } catch (Exception ignored) {}
                sock = device.createRfcommSocketToServiceRecord(SPP_UUID);
                sock.connect();
            }

            btSocket = sock;
            btOut = sock.getOutputStream();
            btAddress = address;
            try {
                String n = device.getName();
                btName = (n == null || n.isEmpty()) ? "طابعة حرارية" : n;
            } catch (Exception e) { btName = "طابعة حرارية"; }

            // Init printer
            btOut.write(new byte[]{0x1B, 0x40}); // ESC @
            btOut.flush();

            JSONObject o = new JSONObject();
            o.put("name", btName);
            o.put("address", btAddress);
            emit("connected", o.toString());
        } catch (Exception e) {
            btAddress = ""; btName = "";
            emit("error", "{\"msg\":\"تعذر الاتصال بالطابعة — تأكد أنها تعمل ومقترنة بالهاتف\"}");
        }
    }

    private void disconnectInBackground(boolean notify) {
        try {
            if (btOut != null) btOut.close();
        } catch (Exception ignored) {}
        try {
            if (btSocket != null) btSocket.close();
        } catch (Exception ignored) {}
        btOut = null;
        btSocket = null;
        btAddress = "";
        btName = "";
        if (notify) emit("disconnected", "{}");
    }

    /* ============================================================
       Printing — ESC/POS raster
       ============================================================ */

    private void printInBackground(String payloadJson) {
        try {
            JSONObject p = new JSONObject(payloadJson == null ? "{}" : payloadJson);
            int widthMm = p.optInt("widthMm", 58);
            int widthPx = widthMm >= 80 ? 576 : 384;
            Bitmap bmp = buildReceiptBitmap(p, widthPx);
            byte[] raster = toEscPosRaster(bmp);

            OutputStream os = btOut;
            if (os == null) { emit("error", "{\"msg\":\"انقطع الاتصال بالطابعة\"}"); return; }
            synchronized (this) {
                os.write(new byte[]{0x1B, 0x40}); // ESC @ — initialize
                int chunk = 1024;
                for (int off = 0; off < raster.length; off += chunk) {
                    os.write(raster, off, Math.min(chunk, raster.length - off));
                    os.flush();
                    Thread.sleep(8);
                }
                os.write(new byte[]{0x1B, 0x64, 0x04});       // ESC d 4 — feed 4 lines
                os.write(new byte[]{0x1D, 0x56, 0x42, 0x00}); // GS V 66 0 — partial cut
                os.flush();
            }
            emit("printed", "{}");
        } catch (Exception e) {
            emit("error", "{\"msg\":\"فشلت الطباعة — تحقق من الطابعة وأعد المحاولة\"}");
        }
    }

    /** Convert an ARGB bitmap into a GS v 0 raster command payload. */
    private byte[] toEscPosRaster(Bitmap bmp) {
        int w = bmp.getWidth(), h = bmp.getHeight();
        int rowBytes = (w + 7) / 8;
        ByteArrayOutputStream out = new ByteArrayOutputStream(16 + rowBytes * h);

        // Pre-threshold to a boolean matrix (luminance < 128 = black).
        boolean[][] black = new boolean[w][h];
        int[] px = new int[w];
        for (int y = 0; y < h; y++) {
            bmp.getPixels(px, 0, w, 0, y, w, 1);
            for (int x = 0; x < w; x++) {
                int c = px[x];
                int lum = (int) (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c));
                black[x][y] = lum < 128 && Color.alpha(c) > 40;
            }
        }

        out.write(0x1D); out.write(0x76); out.write(0x30); out.write(0x00); // GS v 0
        out.write(rowBytes & 0xFF); out.write((rowBytes >> 8) & 0xFF);
        out.write(h & 0xFF); out.write((h >> 8) & 0xFF);
        for (int x = 0; x < w; x++) {
            for (int y8 = 0; y8 < h; y8 += 8) {
                int b = 0;
                for (int k = 0; k < 8; k++) {
                    int y = y8 + k;
                    if (y < h && black[x][y]) b |= (0x80 >> k);
                }
                out.write(b);
            }
        }
        return out.toByteArray();
    }

    /* ============================================================
       Receipt bitmap — Arabic rendered via Canvas (always correct)
       ============================================================ */

    private Bitmap buildReceiptBitmap(JSONObject p, int W) {
        String storeName  = p.optString("storeName", "تاجر برو");
        String storePhone = p.optString("storePhone", "");
        String currency   = p.optString("currency", "");
        String code       = p.optString("code", "");
        String dateText   = p.optString("dateText", "");
        boolean voided    = p.optBoolean("voided", false);
        JSONArray items   = p.optJSONArray("items");
        double subtotal   = p.optDouble("subtotal", 0);
        double discount   = p.optDouble("discount", 0);
        double total      = p.optDouble("total", 0);
        double paid       = p.optDouble("paid", 0);
        double change     = p.optDouble("change", 0);

        int pad = Math.max(8, W / 24);
        int amountRight = pad + (int) (W * 0.30); // right edge of the amounts column

        TextPaint pStore = paint(Typeface.DEFAULT_BOLD, W * 0.078f);
        TextPaint pSub   = paint(Typeface.DEFAULT,      W * 0.043f);
        TextPaint pBody  = paint(Typeface.DEFAULT,      W * 0.049f);
        TextPaint pSmall = paint(Typeface.DEFAULT,      W * 0.041f);
        TextPaint pTotal = paint(Typeface.DEFAULT_BOLD, W * 0.062f);

        // Draw on a tall canvas, then crop to the used height.
        Bitmap bmp = Bitmap.createBitmap(W, 3200, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        c.drawColor(Color.WHITE);

        float y = W * 0.09f;

        // Store name + phone
        y = drawCentered(c, storeName, pStore, W, y);
        if (!storePhone.isEmpty()) y = drawCentered(c, storePhone, pSub, W, y + W * 0.012f);
        y += W * 0.03f;
        y = dashed(c, y, W, pad);
        y += W * 0.035f;

        // Invoice meta
        if (!code.isEmpty()) {
            y = drawRow(c, "رقم الفاتورة", code, pBody, W, pad, amountRight, y);
            y += W * 0.012f;
        }
        if (!dateText.isEmpty()) {
            y = drawRow(c, "التاريخ", dateText, pBody, W, pad, amountRight, y);
            y += W * 0.012f;
        }
        y += W * 0.02f;
        y = dashed(c, y, W, pad);
        y += W * 0.035f;

        // Items
        int itemCount = items != null ? items.length() : 0;
        for (int i = 0; i < itemCount; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String name = it.optString("name", "");
            double qty = it.optDouble("qty", 0);
            double price = it.optDouble("price", 0);
            double lineTotal = it.optDouble("total", qty * price);

            TextPaint np = paint(Typeface.DEFAULT_BOLD, W * 0.049f);
            int avail = (int) (W - pad * 2 - (W - amountRight) - W * 0.02f);
            y = drawWrappedRight(c, name, np, W - pad, avail, y);
            y = drawRight(c, qtyStr(qty) + " × " + moneyStr(price), pSmall, W - pad, y + W * 0.008f);
            drawLeftAmount(c, moneyStr(lineTotal), pBody, amountRight, y - lineHeight(np));
            y += W * 0.028f;
        }
        if (itemCount == 0) {
            y = drawRight(c, "لا توجد أصناف", pSmall, W - pad, y);
            y += W * 0.028f;
        }
        y = dashed(c, y, W, pad);
        y += W * 0.035f;

        // Totals
        y = drawTotalsRow(c, "المجموع الفرعي", moneyStr(subtotal), pBody, W, pad, amountRight, y);
        y += W * 0.014f;
        if (discount > 0) {
            y = drawTotalsRow(c, "الخصم", "−" + moneyStr(discount), pBody, W, pad, amountRight, y);
            y += W * 0.014f;
        }
        String totLabel = currency.isEmpty() ? "الإجمالي" : "الإجمالي (" + currency + ")";
        y = drawTotalsRow(c, totLabel, moneyStr(total), pTotal, W, pad, amountRight, y);
        y += W * 0.014f;
        if (paid > 0) {
            y = drawTotalsRow(c, "المدفوع", moneyStr(paid), pBody, W, pad, amountRight, y);
            y += W * 0.014f;
            y = drawTotalsRow(c, "الباقي", moneyStr(change), pBody, W, pad, amountRight, y);
            y += W * 0.014f;
        }

        // Voided stamp
        if (voided) {
            y += W * 0.02f;
            y = drawCentered(c, "⚠ فاتورة مرتجعة — غير سارية", pTotal, W, y);
            y += W * 0.02f;
        }

        y = dashed(c, y + W * 0.02f, W, pad);
        y += W * 0.045f;

        // QR verification block
        if (!code.isEmpty()) {
            try {
                int qrSize = (int) (W * 0.34);
                Hashtable<EncodeHintType, Object> hints = new Hashtable<>();
                hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
                hints.put(EncodeHintType.MARGIN, 0);
                BitMatrix m = new QRCodeWriter()
                        .encode(code, BarcodeFormat.QR_CODE, qrSize, qrSize, hints);
                int qx = (W - qrSize) / 2;
                Paint qp = new Paint();
                qp.setColor(Color.BLACK);
                qp.setStyle(Paint.Style.FILL);
                for (int ix = 0; ix < qrSize; ix++) {
                    for (int iy = 0; iy < qrSize; iy++) {
                        if (m.get(ix, iy)) {
                            c.drawRect(qx + ix, y + iy, qx + ix + 1, y + iy + 1, qp);
                        }
                    }
                }
                y += qrSize + W * 0.025f;
                y = drawCentered(c, "امسح رمز QR بالتطبيق للتحقق من الفاتورة", pSmall, W, y);
                y = drawCentered(c, code, paint(Typeface.DEFAULT_BOLD, W * 0.048f), W, y + W * 0.012f);
                y += W * 0.025f;
            } catch (Exception ignored) {}
        }

        y = dashed(c, y, W, pad);
        y += W * 0.04f;
        y = drawCentered(c, "شكراً لتعاملكم معنا", pBody, W, y);
        y = drawCentered(c, "تاجر برو — يعمل بدون إنترنت", pSmall, W, y + W * 0.02f);
        y += W * 0.08f;

        int finalH = (int) Math.min(y, bmp.getHeight());
        Bitmap cropped = Bitmap.createBitmap(bmp, 0, 0, W, finalH);
        if (cropped != bmp) bmp.recycle();
        return cropped;
    }

    /* ---------- small drawing helpers ---------- */

    private TextPaint paint(Typeface tf, float size) {
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTypeface(tf);
        tp.setTextSize(size);
        tp.setColor(Color.BLACK);
        return tp;
    }

    private float lineHeight(TextPaint tp) {
        Paint.FontMetrics fm = tp.getFontMetrics();
        return fm.descent - fm.ascent;
    }

    private float drawCentered(Canvas c, String text, TextPaint tp, int W, float y) {
        if (text == null || text.isEmpty()) return y;
        float w = tp.measureText(text);
        c.drawText(text, (W - w) / 2f, y + lineHeight(tp) * 0.8f, tp);
        return y + lineHeight(tp);
    }

    private float drawRight(Canvas c, String text, TextPaint tp, float rightX, float y) {
        if (text == null || text.isEmpty()) return y;
        float baseline = y + lineHeight(tp) * 0.8f;
        while (!text.isEmpty() && tp.measureText(text) > (rightX - 4)) {
            text = text.substring(1); // safety: trim from the right (rare)
        }
        c.drawText(text, rightX, baseline, tp);
        return y + lineHeight(tp);
    }

    /** Arabic item name, wrapped to maxLines, right-aligned at rightX. */
    private float drawWrappedRight(Canvas c, String text, TextPaint tp, float rightX, int availW, float y) {
        if (text == null || text.isEmpty()) return y;
        StaticLayout sl;
        if (Build.VERSION.SDK_INT >= 23) {
            sl = StaticLayout.Builder.obtain(text, 0, text.length(), tp, availW)
                    .setAlignment(Layout.Alignment.ALIGN_OPPOSITE)
                    .setLineSpacing(0f, 1f).setIncludePad(false).build();
        } else {
            sl = new StaticLayout(text, tp, availW, Layout.Alignment.ALIGN_OPPOSITE, 1f, 0f, false);
        }
        // draw manually line by line (right aligned), max 2 lines
        int lines = Math.min(sl.getLineCount(), 2);
        float lh = lineHeight(tp);
        for (int i = 0; i < lines; i++) {
            int st = sl.getLineStart(i), en = sl.getLineEnd(i);
            String line = text.substring(st, en).trim();
            float baseline = y + i * lh + lh * 0.8f;
            float w = tp.measureText(line);
            c.drawText(line, rightX - w, baseline, tp);
        }
        if (sl.getLineCount() > 2) {
            float baseline = y + 2 * lh + lh * 0.8f;
            c.drawText("…", rightX, baseline, tp);
            return y + 3 * lh;
        }
        return y + lines * lh;
    }

    /** Label right-aligned at right margin; value right-aligned at amountRight. */
    private float drawRow(Canvas c, String label, String value, TextPaint tp,
                          int W, int pad, int amountRight, float y) {
        drawRight(c, label, tp, W - pad, y);
        drawRight(c, value, tp, amountRight, y);
        return y + lineHeight(tp);
    }

    private float drawTotalsRow(Canvas c, String label, String value, TextPaint tp,
                                int W, int pad, int amountRight, float y) {
        return drawRow(c, label, value, tp, W, pad, amountRight, y);
    }

    private float drawLeftAmount(Canvas c, String text, TextPaint tp, float amountRight, float y) {
        // Same baseline as the name line: value right-aligned at amountRight.
        float w = tp.measureText(text);
        c.drawText(text, amountRight - w, y, tp);
        return y;
    }

    private float dashed(Canvas c, float y, int W, int pad) {
        Paint p = new Paint();
        p.setColor(Color.BLACK);
        p.setStrokeWidth(2f);
        float dash = 6f, gap = 5f, x = pad;
        while (x < W - pad) {
            c.drawLine(x, y, Math.min(x + dash, W - pad), y, p);
            x += dash + gap;
        }
        return y;
    }

    private String moneyStr(double v) {
        if (Math.abs(v - Math.round(v)) < 0.005) {
            return String.format(Locale.US, "%,d", (long) Math.round(v));
        }
        return String.format(Locale.US, "%,.2f", v);
    }

    private String qtyStr(double q) {
        if (Math.abs(q - Math.round(q)) < 0.005) return String.format(Locale.US, "%d", (long) Math.round(q));
        return String.format(Locale.US, "%.1f", q);
    }

    /* ============================================================
       JS event bridge
       ============================================================ */

    private void emit(final String type, final String json) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (webView == null) return;
                webView.evaluateJavascript(
                        "(window.__printEvent||function(){})('" + type + "'," + json + ");", null);
            }
        });
    }

    /* ============================================================
       Back button
       ============================================================ */

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

    @Override
    protected void onDestroy() {
        disconnectInBackground(false);
        super.onDestroy();
    }
}

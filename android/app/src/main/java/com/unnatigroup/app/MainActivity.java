package com.unnatigroup.app;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Force standard font resizing and disable display auto-zooming
        try {
            WebView webView = this.getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                // Disable Android display accessibility font-scaling from altering our responsive UI
                settings.setTextZoom(100);
                // Ensure proper viewport handling
                settings.setSupportZoom(false);
                settings.setBuiltInZoomControls(false);

                // Add native PrintManager interface for APK on mobile and tablet
                webView.addJavascriptInterface(new AndroidPrintInterface(), "AndroidNativePrint");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public class AndroidPrintInterface {
        @JavascriptInterface
        public void printPdf(final String base64Data, final String docName) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String cleanDocName = (docName != null && !docName.trim().isEmpty()) ? docName.trim() : "Unnati_Document";
                        String safeFileName = cleanDocName.replaceAll("[^a-zA-Z0-9._-]", "_");
                        if (!safeFileName.toLowerCase().endsWith(".pdf")) {
                            safeFileName += ".pdf";
                        }

                        // Save base64 data to a temporary cache file
                        File cacheDir = getCacheDir();
                        final File pdfFile = new File(cacheDir, safeFileName);
                        byte[] pdfBytes = Base64.decode(base64Data, Base64.DEFAULT);
                        FileOutputStream fos = new FileOutputStream(pdfFile);
                        fos.write(pdfBytes);
                        fos.flush();
                        fos.close();

                        PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) {
                            Toast.makeText(MainActivity.this, "Print service not available on this device", Toast.LENGTH_SHORT).show();
                            return;
                        }

                        PrintAttributes.Builder builder = new PrintAttributes.Builder();
                        builder.setMediaSize(PrintAttributes.MediaSize.ISO_A4);
                        builder.setColorMode(PrintAttributes.COLOR_MODE_COLOR);

                        PrintDocumentAdapter printAdapter = new PrintDocumentAdapter() {
                            @Override
                            public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                                                 CancellationSignal cancellationSignal,
                                                 LayoutResultCallback callback, Bundle metadata) {
                                if (cancellationSignal != null && cancellationSignal.isCanceled()) {
                                    callback.onLayoutCancelled();
                                    return;
                                }
                                PrintDocumentInfo info = new PrintDocumentInfo.Builder(cleanDocName)
                                        .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                                        .build();
                                callback.onLayoutFinished(info, true);
                            }

                            @Override
                            public void onWrite(PageRange[] pageRanges, ParcelFileDescriptor destination,
                                                CancellationSignal cancellationSignal,
                                                WriteResultCallback callback) {
                                FileInputStream input = null;
                                FileOutputStream output = null;
                                try {
                                    input = new FileInputStream(pdfFile);
                                    output = new FileOutputStream(destination.getFileDescriptor());
                                    byte[] buf = new byte[8192];
                                    int bytesRead;
                                    while ((bytesRead = input.read(buf)) > 0) {
                                        if (cancellationSignal != null && cancellationSignal.isCanceled()) {
                                            callback.onWriteCancelled();
                                            return;
                                        }
                                        output.write(buf, 0, bytesRead);
                                    }
                                    callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                                } catch (Exception e) {
                                    callback.onWriteFailed(e.getMessage());
                                } finally {
                                    try { if (input != null) input.close(); } catch (Exception ignored) {}
                                    try { if (output != null) output.close(); } catch (Exception ignored) {}
                                }
                            }
                        };

                        printManager.print(cleanDocName, printAdapter, builder.build());
                    } catch (Exception e) {
                        e.printStackTrace();
                        Toast.makeText(MainActivity.this, "Failed to start print: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }
}

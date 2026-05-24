package com.unnatigroup.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

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
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

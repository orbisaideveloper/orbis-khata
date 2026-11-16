package com.orbisaideveloper.khata;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OrbisKhataKeyBridge.class);
        registerPlugin(OrbisKhataOfflineBridge.class);
        registerPlugin(OrbisDriveBridge.class);
        super.onCreate(savedInstanceState);
        // This listener owns system-bar and IME insets. Capacitor SystemBars inset handling is disabled.
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.WHITE);
        WindowCompat.getInsetsController(getWindow(), content).setAppearanceLightStatusBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets safe = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, Math.max(safe.bottom, keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null) {
                    moveTaskToBack(true);
                    return;
                }
                var webView = getBridge().getWebView();
                webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('orbis-native-back', {cancelable: true}))",
                    result -> {
                        if ("false".equals(result)) return;
                        if (webView.canGoBack()) webView.goBack();
                        else moveTaskToBack(true);
                    }
                );
            }
        });
    }
}

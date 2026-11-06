package com.orbisaideveloper.khata;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.Intent;
import android.app.Instrumentation;
import android.os.SystemClock;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs on a device/emulator, not a JVM mock. No customer or backend writes. */
@RunWith(AndroidJUnit4.class)
public class PackageSafetyTest {
    @Test(timeout = 90000)
    public void launchesBundledReactWithoutRemoteNavigation() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            AtomicBoolean rendered = new AtomicBoolean(false);
            long deadline = SystemClock.elapsedRealtime() + 60000;
            while (!rendered.get() && SystemClock.elapsedRealtime() < deadline) {
                CountDownLatch checked = new CountDownLatch(1);
                instrumentation.runOnMainSync(() -> {
                    assertNotNull(activity.getBridge());
                    activity.getBridge().getWebView().evaluateJavascript(
                        "location.origin === 'https://localhost' && !!document.querySelector('#root main')",
                        value -> {
                            if ("true".equals(value)) rendered.set(true);
                            checked.countDown();
                        });
                });
                // Cold emulator WebView initialization can delay the first callback.
                // Wait for the actual rendered state, not a single 2-second callback.
                long remaining = Math.max(1, deadline - SystemClock.elapsedRealtime());
                checked.await(Math.min(5000, remaining), TimeUnit.MILLISECONDS);
                if (!rendered.get()) Thread.sleep(250);
            }
            assertTrue("Bundled React screen did not render on the local origin within 60 seconds", rendered.get());
            instrumentation.runOnMainSync(() -> {
                View content = activity.findViewById(android.R.id.content);
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(content);
                assertNotNull(insets);
                Insets safe = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                int[] position = new int[2];
                activity.getBridge().getWebView().getLocationOnScreen(position);
                assertTrue("Header overlaps status bar", position[1] >= safe.top);
                assertTrue("Content overlaps navigation bar",
                    position[1] + activity.getBridge().getWebView().getHeight()
                    <= content.getRootView().getHeight() - safe.bottom);
            });
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    @Test
    public void installedPackageRejectsBackupAndCleartext() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.orbisaideveloper.khata", context.getPackageName());
        ApplicationInfo info = context.getApplicationInfo();
        assertEquals("Khata Boi", context.getPackageManager().getApplicationLabel(info).toString());
        assertEquals(0, info.flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
        assertEquals(0, info.flags & ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC);
    }
}

package com.orbisaideveloper.khata;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.Intent;
import android.app.Instrumentation;
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
    @Test
    public void launchesBundledReactWithoutRemoteNavigation() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            AtomicBoolean rendered = new AtomicBoolean(false);
            for (int attempt = 0; attempt < 60 && !rendered.get(); attempt++) {
                CountDownLatch checked = new CountDownLatch(1);
                instrumentation.runOnMainSync(() -> {
                    assertNotNull(activity.getBridge());
                    activity.getBridge().getWebView().evaluateJavascript(
                        "location.origin === 'https://localhost' && !!document.querySelector('#root main')",
                        value -> { rendered.set("true".equals(value)); checked.countDown(); });
                });
                assertTrue("WebView script callback timed out", checked.await(2, TimeUnit.SECONDS));
                if (!rendered.get()) Thread.sleep(250);
            }
            assertTrue("Bundled React screen did not render on the local origin", rendered.get());
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    @Test
    public void installedPackageRejectsBackupAndCleartext() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.orbisaideveloper.khata", context.getPackageName());
        ApplicationInfo info = context.getApplicationInfo();
        assertEquals(0, info.flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
        assertEquals(0, info.flags & ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC);
    }
}

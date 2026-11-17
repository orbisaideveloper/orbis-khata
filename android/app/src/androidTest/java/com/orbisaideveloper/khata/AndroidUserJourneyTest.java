package com.orbisaideveloper.khata;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.app.Activity;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/**
 * Real installed Android/WebView UI acceptance: no fake backend, no credentials,
 * no test-user writes. Later authenticated CRUD tests require isolated test data.
 */
@RunWith(AndroidJUnit4.class)
public class AndroidUserJourneyTest {
    private String javascript(MainActivity activity, String expression) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView()
            .evaluateJavascript(expression, value -> {
                result.set(value);
                completed.countDown();
            }));
        assertTrue("WebView Javascript callback timed out", completed.await(8, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(MainActivity activity, String expression, long timeoutMillis) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMillis;
        do {
            if ("true".equals(javascript(activity, expression))) return;
            Thread.sleep(300);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("Android UI acceptance timed out: " + expression);
    }

    @Test(timeout = 115000)
    public void opensLoginAndAllowsPasswordVisibilityToggleWithoutSubmittingCredentials() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            long deadline = SystemClock.elapsedRealtime() + 75000;
            while (activity.getBridge() == null && SystemClock.elapsedRealtime() < deadline) {
                Thread.sleep(250);
            }
            assertNotNull("Capacitor bridge did not start", activity.getBridge());
            waitFor(activity, "(function(){return !!document.querySelector('main[data-view=\"welcome\"] .actions button.primary,input[name=\"password\"]')})()", 75000);
            assertEquals("true", javascript(activity,
                "(function(){const b=document.querySelector('main[data-view=\"welcome\"] .actions button.primary');"
                + "if(b){b.click();return true;}return !!document.querySelector('input[name=\"password\"]')})()"));
            waitFor(activity, "(function(){return !!document.querySelector('form input[name=\"email\"]')"
                + "&& !!document.querySelector('form input[name=\"password\"]')})()", 12000);
            assertEquals("true", javascript(activity,
                "(function(){const p=document.querySelector('form input[name=\"password\"]');"
                + "return p.type==='password' && p.value===''})()"));
            assertEquals("true", javascript(activity,
                "(function(){const p=document.querySelector('form input[name=\"password\"]');"
                + "const b=p.closest('.account-password')?.querySelector('button');"
                + "if(!b)return false;b.click();return true})()"));
            waitFor(activity, "(function(){return document.querySelector('form input[name=\"password\"]')?.type==='text'})()", 5000);
            assertEquals("true", javascript(activity,
                "(function(){const p=document.querySelector('form input[name=\"password\"]');"
                + "p.closest('.account-password').querySelector('button').click();"
                + "return true})()"));
            waitFor(activity, "(function(){const p=document.querySelector('form input[name=\"password\"]');return !!p && p.type==='password' && p.value===''})()", 5000);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}

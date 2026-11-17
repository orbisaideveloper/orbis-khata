package com.orbisaideveloper.khata;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/**
 * Android APP acceptance, not a simulated Chromium page: runs on the installed
 * APK's live Capacitor WebView. All flows are read-only; no submission or DB write.
 */
@RunWith(AndroidJUnit4.class)
public class AndroidPublicFlowsTest {
    private MainActivity open() throws Exception {
        Instrumentation inst=InstrumentationRegistry.getInstrumentation();
        Context context=inst.getTargetContext();
        MainActivity activity=(MainActivity)inst.startActivitySync(
            new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        long deadline=SystemClock.elapsedRealtime()+75000;
        while(activity.getBridge()==null && SystemClock.elapsedRealtime()<deadline)
            Thread.sleep(250);
        assertNotNull("Capacitor bridge not available",activity.getBridge());
        return activity;
    }

    private String js(MainActivity activity,String expression) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);
        AtomicReference<String> output=new AtomicReference<>("");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->
            activity.getBridge().getWebView().evaluateJavascript(expression,value->{
                output.set(value);latch.countDown();
            }));
        assertTrue("Android WebView callback timed out",latch.await(8,TimeUnit.SECONDS));
        return output.get();
    }

    private void until(MainActivity activity,String expression,long timeoutMs) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+timeoutMs;
        do {
            if("true".equals(js(activity,expression)))return;
            Thread.sleep(250);
        }while(SystemClock.elapsedRealtime()<deadline);
        fail("Actual Android screen state did not appear: "+expression);
    }

    private void login(MainActivity activity) throws Exception {
        until(activity,"(function(){return !!document.querySelector('main[data-view=welcome] .actions button.primary, form input[name=password]')})()",75000);
        assertEquals("true",js(activity,
            "(function(){let b=document.querySelector('main[data-view=welcome] .actions button.primary');"
            +"if(b)b.click();return true})()"));
        until(activity,"(function(){return !!document.querySelector('form input[name=password]') && !!document.querySelector('form input[name=email]')})()",12000);
    }

    private void close(MainActivity activity) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
    }

    @Test(timeout=115000)
    public void signupAndForgotPasswordScreensRequireNoBackendWrites() throws Exception {
        MainActivity activity=open();
        try {
            login(activity);
            assertEquals("true",js(activity,
                "(function(){let b=document.querySelector('.form .options button:first-child');"
                +"if(!b)return false;b.click();return true})()"));
            until(activity,"(function(){return !!document.querySelector('input[name=first]')"
                +"&& !!document.querySelector('input[name=last]')"
                +"&& !!document.querySelector('input[name=phone]')"
                +"&& !!document.querySelector('input[name=password]')})()",5000);
            assertEquals("true",js(activity,
                "(function(){let b=document.querySelector('.form .options button:first-child');"
                +"if(!b)return false;b.click();return true})()"));
            until(activity,"(function(){return !!document.querySelector('input[name=password]')"
                +"&& !document.querySelector('input[name=first]')})()",5000);
            assertEquals("true",js(activity,
                "(function(){let b=document.querySelector('.form .options button:nth-child(2)');"
                +"if(!b)return false;b.click();return true})()"));
            until(activity,"(function(){let e=document.querySelector('form input[name=email]');"
                +"return !!e&&e.type==='email'&&!document.querySelector('input[name=password]')})()",5000);
            assertEquals("true",js(activity,
                "(function(){let b=document.querySelector('.form .options button:first-child');"
                +"if(!b)return false;b.click();return true})()"));
            until(activity,"(function(){return !!document.querySelector('input[name=password]')"
                +"&& document.querySelector('form input[name=email]')?.type==='text'})()",5000);
        }finally {close(activity);}
    }

    @Test(timeout=115000)
    public void languageSelectionPersistsWhileNavigatingWelcomeAndLogin() throws Exception {
        MainActivity activity=open();
        try {
            until(activity,"(function(){return !!document.querySelector('main[data-view=welcome] select.lang')})()",75000);
            assertEquals("true",js(activity,
                "(function(){let s=document.querySelector('main[data-view=welcome] select.lang');"
                +"if(!s)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'en');"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            until(activity,"(function(){return document.documentElement.lang==='en'"
                +"&&document.querySelector('main[data-view=welcome] select.lang')?.value==='en'})()",5000);
            login(activity);
            until(activity,"(function(){return document.documentElement.lang==='en'"
                +"&&!!document.querySelector('main[data-view=login]')})()",5000);
            assertEquals("true",js(activity,
                "(function(){const b=document.querySelector('main[data-view=login] header button.back');"
                +"if(!b)return false;b.click();return true})()"));
            until(activity,"(function(){return !!document.querySelector('main[data-view=welcome]')"
                +"&&document.documentElement.lang==='en'})()",5000);
            assertEquals("true",js(activity,
                "(function(){let s=document.querySelector('main[data-view=welcome] select.lang');"
                +"Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'bn');"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            until(activity,"(function(){return document.documentElement.lang==='bn'})()",5000);
        }finally {close(activity);}
    }
}

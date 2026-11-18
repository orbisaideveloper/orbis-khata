package com.orbisaideveloper.khata;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AndroidAuthenticatedAcceptanceTest {
    private MainActivity activity;
    private static final String COMPANY="ORBIS Automation Test";
    private String evaluate(String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);
        AtomicReference<String> result=new AtomicReference<>("");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            activity.getBridge().getWebView().evaluateJavascript(script,value->{
                result.set(value);latch.countDown();
            }));
        assertTrue("WebView unresponsive",latch.await(10,TimeUnit.SECONDS));
        return result.get();
    }
    private boolean truth(String expr) throws Exception {return "true".equals(evaluate(expr));}
    private String quote(String value) {return JSONObject.quote(value);}
    private void until(String expr,String label,long millis) throws Exception {
        long end=SystemClock.elapsedRealtime()+millis;
        while(SystemClock.elapsedRealtime()<end) {
            if(truth(expr))return;
            Thread.sleep(350);
        }
        fail("Real Android acceptance timeout at "+label);
    }
    private void click(String selector,String label) throws Exception {
        assertTrue("Missing button "+label,truth("(function(){let b=document.querySelector("+quote(selector)+");"
            +"if(!b||b.disabled)return false;b.click();return true})()"));
        System.out.println("ORBIS_STEP_PASS "+label);
    }
    private void fill(String selector,String value,String label) throws Exception {
        assertTrue("Missing field "+label,truth("(function(){let x=document.querySelector("+quote(selector)+");"
            +"if(!x||x.disabled)return false;"
            +"Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(x,"+quote(value)+");"
            +"x.dispatchEvent(new Event('input',{bubbles:true}));"
            +"x.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
        System.out.println("ORBIS_STEP_PASS "+label);
    }
    private void nav(String name) throws Exception {
        assertTrue("Page missing "+name,truth("(function(){let b=Array.from(document.querySelectorAll('.books-navigation button'))"
            +".find(x=>x.textContent.trim()==="+quote(name)+");if(!b||b.disabled)return false;b.click();return true})()"));
    }
    @Test(timeout=420000)
    public void reviewerLoginAndIsolatedLocalMasters() throws Exception {
        Bundle options=InstrumentationRegistry.getArguments();
        String email=options.getString("khata_email","");
        String password=options.getString("khata_password","");
        String run=options.getString("khata_run","");
        // The ordinary public CI has NO secrets: this test is SKIPPED there.
        Assume.assumeTrue("Manual owner-only test",!email.isBlank()&&!password.isBlank());
        assertEquals("Unexpected reviewer email - refusing data writes","orbisaideveloper+playreview@gmail.com",email);
        assertTrue("Run ID is required",run.matches("[0-9]{1,18}"));
        Instrumentation inst=InstrumentationRegistry.getInstrumentation();
        Context context=inst.getTargetContext();
        activity=(MainActivity)inst.startActivitySync(new Intent(context,MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            long bridgeDeadline=SystemClock.elapsedRealtime()+75000;
            while(activity.getBridge()==null&&SystemClock.elapsedRealtime()<bridgeDeadline)Thread.sleep(250);
            assertNotNull("Native Capacitor bridge failed",activity.getBridge());
            until("(function(){return !!document.querySelector('main[data-view=welcome] .actions button.primary,form input[name=password]')})()",
                "welcome or login",100000);
            if(truth("(function(){return !!document.querySelector('main[data-view=welcome] .actions button.primary')})()"))
                click("main[data-view=welcome] .actions button.primary","open login");
            until("(function(){return !!document.querySelector('form input[name=email]')&&!!document.querySelector('form input[name=password]')})()",
                "login fields",12000);
            fill("form input[name=email]",email,"reviewer email");
            fill("form input[name=password]",password,"reviewer password (never logged)");
            assertTrue("Login form not found",truth("(function(){let f=document.querySelector('form:has(input[name=password])');"
                +"if(!f)return false;f.requestSubmit();return true})()"));
            long loginDeadline=SystemClock.elapsedRealtime()+135000;
            boolean verified=false;
            while(SystemClock.elapsedRealtime()<loginDeadline) {
                truth("(function(){window.dispatchEvent(new PopStateEvent('popstate',{state:{khataView:'workspace'}}));return true})()");
                if(quote("ORB-U-DEE7F753").equals(evaluate("(function(){return document.querySelector('main[data-view=workspace] .orbis-account-id')?.textContent.trim()||''})()"))) {
                    verified=true;break;
                }
                Thread.sleep(650);
            }
            assertTrue("Expected central reviewer identity missing; no financial data changed",verified);
            System.out.println("ORBIS_STEP_PASS central reviewer identity");
            click("[data-workspace-card=khata] button.module","open Khata");
            until("(function(){return !!document.querySelector('main[data-view=khata] .books')})()","Khata",30000);
            if(truth("(function(){return !!document.querySelector('.kh-company-manage')})()"))
                click(".kh-company-manage","company management");
            until("(function(){return !!document.querySelector('.books-company button')})()","company manager",22000);
            String exists="(function(){let s=document.querySelector('.books-company select');return !!s&&"
                +"Array.from(s.options).some(o=>o.textContent.trim()==="+quote(COMPANY)+")})()";
            if(!truth(exists)) {
                click(".books-company button","new test-only company");
                until("(function(){return !!document.querySelector('form.books-form input[name=name]')})()","company form",8000);
                fill("form.books-form input[name=name]",COMPANY,"isolated company name");
                assertTrue("Company form missing",truth("(function(){document.querySelector('form.books-form').requestSubmit();return true})()"));
                until(exists,"isolated company save",25000);
            }
            assertTrue("Exact company selection failed",truth("(function(){let s=document.querySelector('.books-company select');"
                +"let o=Array.from(s.options).find(x=>x.textContent.trim()==="+quote(COMPANY)+");"
                +"if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            until("(function(){return !!document.querySelector('.books-hero')&&"
                +"document.querySelector('.books-hero').textContent.includes("+quote(COMPANY)+")})()",
                "confirmed isolated company",25000);
            System.out.println("ORBIS_STEP_PASS isolated company verified");
            // Additional data mutation is forbidden if navigation does not enter this exact company.
            until("(function(){return !!Array.from(document.querySelectorAll('.books-navigation button'))"
                +".find(b=>b.textContent.trim()==='পার্টি'||b.textContent.trim()==='Parties')})()",
                "masters navigation",30000);
            String party="AUTO CUSTOMER "+run;
            nav("পার্টি");
            until("(function(){return !!document.querySelector('.master-parties')})()","Party page",12000);
            click(".master-page .books-section-title button","add party");
            fill(".master-page form.books-form input[name=name]",party,"synthetic Party");
            assertTrue("Party save failed to start",truth("(function(){document.querySelector('.master-page form.books-form').requestSubmit();return true})()"));
            until("(function(){return !!document.querySelector('.master-parties')&&document.querySelector('.master-parties').textContent.includes("+quote(party)+")})()",
                "Party saved",25000);
            nav("আইটেম");
            until("(function(){return !!document.querySelector('.master-items')})()","Item page",12000);
            click(".master-page .books-section-title button","add item");
            fill(".master-page form.books-form input[name=name]","AUTO ITEM "+run,"synthetic Item");
            fill(".master-page form.books-form input[name=unit]","litre","item unit");
            assertTrue("Item save failed to start",truth("(function(){document.querySelector('.master-page form.books-form').requestSubmit();return true})()"));
            until("(function(){return !!document.querySelector('.master-items')&&"
                +"document.querySelector('.master-items').textContent.includes("+quote("AUTO ITEM "+run)+")})()",
                "Item saved",25000);
            System.out.println("ORBIS_TEST_COMPLETE reviewer login + isolated local company + Party + Item");
        } finally {
            inst.runOnMainSync(activity::finish);
        }
    }
}

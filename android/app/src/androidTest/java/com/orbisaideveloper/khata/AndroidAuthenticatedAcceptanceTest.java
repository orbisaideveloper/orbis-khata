package com.orbisaideveloper.khata;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
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
    private void actionRestoreConfirm() throws Exception {
        assertTrue("Confirmation handler restore failed",truth("(function(){if(!window.__orbisOriginalConfirm)return false;window.confirm=window.__orbisOriginalConfirm;delete window.__orbisOriginalConfirm;return true})()"));
    }
    @Test(timeout=420000)
    public void reviewerLoginAndIsolatedLocalMasters() throws Exception {
        Bundle options=InstrumentationRegistry.getArguments();
        String email=options.getString("khata_email","");
        String passwordEncoded=options.getString("khata_password_b64","");
        String password="";
        if(!passwordEncoded.isEmpty())password=new String(Base64.decode(passwordEncoded,Base64.DEFAULT),StandardCharsets.UTF_8);
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
                +"if(!f||f.querySelector('fieldset:disabled'))return false;f.requestSubmit();return true})()"));
            System.out.println("ORBIS_AUTH_STAGE LOGIN_SUBMITTED");
            // Real auth: network, session, native enrollment, and React render.
            // Never force a popstate event during login; it can interfere with navigation.
            long loginDeadline=SystemClock.elapsedRealtime()+135000;
            boolean verified=false;
            String previousStage="";
            String lastStage="UNOBSERVED";
            while(SystemClock.elapsedRealtime()<loginDeadline) {
                String state=evaluate("(function(){"
                    +"const main=document.querySelector('main');"
                    +"const id=main?.querySelector('.orbis-account-id')?.textContent?.trim()||'';"
                    +"if(id==="+quote("ORB-U-DEE7F753")+")return 'REVIEWER_VERIFIED';"
                    +"if(id)return 'WRONG_IDENTITY';"
                    +"const diag=main?.querySelector('[data-testid=native-auth-diagnostic]')?.textContent||'';"
                    +"if(diag.includes('ENROLL_SIGNIN'))return 'NATIVE_ENROLL_SIGNIN';"
                    +"if(diag.includes('ENROLL_RESTORE'))return 'NATIVE_ENROLL_RESTORE';"
                    +"if(diag.includes('CENTRAL_WAIT'))return 'NATIVE_CENTRAL_WAIT';"
                    +"if(diag.includes('CENTRAL_RESTORE'))return 'NATIVE_CENTRAL_RESTORE';"
                    +"if(diag.includes('OFFLINE_RESTORE'))return 'NATIVE_OFFLINE_RESTORE';"
                    +"if(diag)return 'NATIVE_AUTH_DIAGNOSTIC';"
                    +"if(main?.querySelector('[role=alert]'))return 'APP_ERROR';"
                    +"if(main?.querySelector('.form .status-message'))return 'LOGIN_ERROR_MESSAGE';"
                    +"if(main?.querySelector('form fieldset:disabled'))return 'LOGIN_PENDING';"
                    +"if(main?.querySelector('form input[name=password]'))return 'LOGIN_FORM';"
                    +"if(main?.querySelector('output'))return 'APP_LOADING_OR_OUTPUT';"
                    +"return 'NO_EXPECTED_AUTH_VIEW';"
                    +"})()");
                // Fixed allow-listed codes: no password, token, ID or response body.
                lastStage=state.replace(String.valueOf((char)34), "");
                if(!lastStage.equals(previousStage)){
                    System.out.println("ORBIS_AUTH_STAGE "+lastStage);
                    previousStage=lastStage;
                }
                if("REVIEWER_VERIFIED".equals(lastStage)){verified=true;break;}
                if("WRONG_IDENTITY".equals(lastStage))break;
                Thread.sleep(650);
            }
            assertTrue("Central reviewer auth did not complete; final safe stage="+lastStage
                +"; financial data unchanged",verified);
            System.out.println("ORBIS_STEP_PASS central reviewer identity");
            assertTrue("Cannot set stable Bengali test selectors",truth(
                "(function(){let s=document.querySelector('main[data-view=workspace] select.lang');"
                +"if(!s)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'bn');"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            until("(function(){return document.documentElement.lang==='bn'})()","Bengali language selected",8000);
            click("[data-workspace-card=khata] button.module","open Khata");
            until("(function(){return !!document.querySelector('main[data-view=khata] .books')})()","Khata",30000);
            if(truth("(function(){return !!document.querySelector('.kh-company-manage')})()"))
                click(".kh-company-manage","company management");
            until("(function(){return !!document.querySelector('.books-company button')})()","company manager",22000);
            String exists="(function(){let s=document.querySelector('.books-company select');return !!s&&"
                +"Array.from(s.options).some(o=>o.textContent.trim()==="+quote(COMPANY)+")})()";
            if(!truth(exists)) {
                click(".books-company > button","new test-only company");
                until("(function(){return !!document.querySelector('form.books-form input[name=name]')})()","company form",8000);
                fill("form.books-form input[name=name]",COMPANY,"isolated company name");
                assertTrue("Company form missing",truth("(function(){document.querySelector('form.books-form').requestSubmit();return true})()"));
                // Do not blindly retry a create: its SQLCipher commit may have succeeded.
                // Classify only fixed UI states and allowlisted non-sensitive error codes.
                long companyDeadline=SystemClock.elapsedRealtime()+25000;
                String saveStage="UNOBSERVED";
                boolean created=false;
                while(SystemClock.elapsedRealtime()<companyDeadline){
                    if(truth(exists)){created=true;break;}
                    String state=evaluate("(function(){"
                        +"const f=document.querySelector('form.books-form');"
                        +"const code=document.querySelector('[data-testid=khata-tablet-save-error]')?.textContent?.trim()||'';"
                        +"if(/^[A-Z][A-Z0-9_]{3,80}$/.test(code))return 'SAVE_ERROR_'+code;"
                        +"if(!f)return 'FORM_HIDDEN';"
                        +"const out=f.querySelector('output');"
                        +"if(out)return 'FORM_PENDING_OR_ERROR';"
                        +"const b=f.querySelector('button[type=submit]');"
                        +"if(b?.disabled)return 'SAVE_IN_PROGRESS';"
                        +"return 'SAVE_NOT_VISIBLE_IN_LIST';"
                        +"})()");
                    saveStage=state.replace(String.valueOf((char)34),"");
                    if(saveStage.startsWith("SAVE_ERROR_"))break;
                    Thread.sleep(350);
                }
                if(!created){
                    System.out.println("ORBIS_COMPANY_SAVE_STAGE "+saveStage);
                    fail("Isolated test company save not verified; stage="+saveStage+"; no retry");
                }
            }
            assertTrue("Exact company selection failed",truth("(function(){let s=document.querySelector('.books-company select');"
                +"let o=Array.from(s.options).find(x=>x.textContent.trim()==="+quote(COMPANY)+");"
                +"if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            until("(function(){return !!document.querySelector('.books-hero')&&"
                +"document.querySelector('.books-hero').textContent.includes("+quote(COMPANY)+")})()",
                "confirmed isolated company",25000);
            System.out.println("ORBIS_STEP_PASS isolated company verified");
            // A newly selected company is displayed in the Accounting editor;
            // return through the real Khata home control before using billing navigation.
            click("header.kh-app-header button.kh-brand","return to Khata home");
            until("(function(){return !!Array.from(document.querySelectorAll('.books-navigation button'))"
                +".find(x=>x.textContent.trim()==='বিল')})()","Khata billing navigation",30000);
            assertTrue("Unexpected active company: refusing test writes",truth(
                "(function(){let s=document.querySelector('.kh-company-modules select');"
                +"return !!s&&s.selectedOptions[0]?.textContent.trim()==="+quote(COMPANY)+"})()"));
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
            until("(function(){return !!document.querySelector('.master-page form.books-form input[name=unit]')})()",
                "new item form",8000);
            fill(".master-page form.books-form input[name=name]","AUTO ITEM "+run,"synthetic Item");
            fill(".master-page form.books-form input[name=unit]","litre","item unit");
            assertTrue("Item save failed to start",truth("(function(){document.querySelector('.master-page form.books-form').requestSubmit();return true})()"));
            until("(function(){return !!document.querySelector('.master-items')&&"
                +"document.querySelector('.master-items').textContent.includes("+quote("AUTO ITEM "+run)+")})()",
                "Item saved",25000);
            // Accounting invariant test: two items at INR 100 each => sale INR 200,
            // separately received INR 80 => expected remaining receivable INR 120.
            // Synthetic data is confined to the verified disposable company.
            nav("বিল");
            until("(function(){return !!document.querySelector('.kh-bill-start')})()","bill start",20000);
            assertTrue("Sales invoice action missing",truth("(function(){let root=document.querySelector('.kh-bill-start');"
                +"let b=Array.from(root.querySelectorAll('button')).find(x=>x.textContent.includes('বিক্রয় বিল'));"
                +"if(!b)return false;b.click();return true})()"));
            until("(function(){return !!document.querySelector('.invoice-page form')})()","invoice form",30000);
            assertTrue("Synthetic customer option not available",truth("(function(){let s=document.querySelector('.invoice-page .invoice-party select');"
                +"let o=s&&Array.from(s.options).find(x=>x.textContent.includes("+quote(party)+"));"
                +"if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            assertTrue("Synthetic item option not available",truth("(function(){let s=document.querySelector('.invoice-page select[aria-label=\"আইটেমের নাম 1\"]');"
                +"let o=s&&Array.from(s.options).find(x=>x.textContent.includes("+quote("AUTO ITEM "+run)+"));"
                +"if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            fill(".invoice-page input[aria-label=\"পরিমাণ 1\"]","2","sale quantity");
            fill(".invoice-page input[aria-label=\"দর 1\"]","100","sale rate");
            until("(function(){let b=document.querySelector('.invoice-page form button.books-primary');return !!b&&!b.disabled})()",
                "invoice review ready",20000);
            click(".invoice-page form button.books-primary","review synthetic sale");
            until("(function(){return !!document.querySelector('.bill-review button.books-primary')})()",
                "review invoice",20000);
            click(".bill-review button.books-primary","save INR 200 sale");
            until("(function(){let r=document.querySelector('.bill-review');return !!r&&r.textContent.includes('বিল সংরক্ষণ হয়েছে।')})()",
                "sale persistence confirmation",30000);
            click(".bill-review .books-buttons button:last-child","back to accounting");
            nav("জমা / পেমেন্ট");
            until("(function(){return !!document.querySelector('.workspace-settings form select')})()",
                "receipt form",20000);
            assertTrue("Receipt customer not available",truth("(function(){let s=document.querySelector('.workspace-settings form select');"
                +"let o=s&&Array.from(s.options).find(x=>x.textContent.includes("+quote(party)+"));"
                +"if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);"
                +"s.dispatchEvent(new Event('change',{bubbles:true}));return true})()"));
            fill(".workspace-settings form input[inputmode=decimal]","80","cash receipt amount");
            assertTrue("Receipt form unavailable",truth("(function(){window.__orbisOriginalConfirm=window.confirm;"
                +"window.confirm=()=>true;let f=document.querySelector('.workspace-settings form');"
                +"if(!f)return false;f.requestSubmit();return true})()"));
            until("(function(){let o=document.querySelector('.workspace-settings output');"
                +"return !!o&&o.textContent.includes('পেমেন্ট সেভ হয়েছে।')})()",
                "INR 80 receipt save",30000);
            actionRestoreConfirm();
            nav("লেজার");
            until("(function(){return !!document.querySelector('.ledger-explorer .ledger-row')})()",
                "ledger list",25000);
            assertTrue("Party ledger missing",truth("(function(){let b=Array.from(document.querySelectorAll('.ledger-explorer .ledger-row'))"
                +".find(x=>x.textContent.includes("+quote(party)+"));if(!b)return false;b.click();return true})()"));
            until("(function(){let e=document.querySelector('.ledger-detail p');if(!e)return false;"
                +"let x=e.textContent.replace(/[০-৯]/g,c=>'০১২৩৪৫৬৭৮৯'.indexOf(c));"
                +"return /120(?:[.,]00)?/.test(x)})()",
                "remaining receivable INR 120",30000);
            System.out.println("ORBIS_TEST_COMPLETE account + company + Party + Item + INR 200 sale + INR 80 receipt + INR 120 ledger");

        } finally {
            inst.runOnMainSync(activity::finish);
        }
    }
}

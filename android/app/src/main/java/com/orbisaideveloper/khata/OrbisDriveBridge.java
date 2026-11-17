package com.orbisaideveloper.khata;

import android.accounts.Account;
import android.app.Activity;
import android.app.PendingIntent;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.activity.result.ActivityResultLauncher;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

@CapacitorPlugin(name = "OrbisDrive")
public class OrbisDriveBridge extends Plugin {
    private ActivityResultLauncher<IntentSenderRequest> consent;
    private PluginCall pending;

    @Override
    public void load() {
        consent = getBridge().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), this::finishConsent);
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pending != null) {
                call.reject("DRIVE_AUTH_BUSY");
                return;
            }
            pending = call;
            AuthorizationRequest.Builder request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope("https://www.googleapis.com/auth/drive.appdata")));
            String email = call.getString("email");
            if (email != null && !email.isEmpty()) request.setAccount(new Account(email, "com.google"));
            Identity.getAuthorizationClient(getActivity()).authorize(request.build())
                .addOnSuccessListener(result -> {
                    PendingIntent prompt = result.getPendingIntent();
                    if (result.hasResolution() && Boolean.TRUE.equals(call.getBoolean("silent"))) {
                        fail("DRIVE_CONSENT_REQUIRED");
                    } else if (result.hasResolution() && prompt != null) {
                        try { consent.launch(new IntentSenderRequest.Builder(prompt.getIntentSender()).build()); }
                        catch (RuntimeException error) { fail("DRIVE_AUTH_FAILED"); }
                    } else {
                        resolveToken(result);
                    }
                })
                .addOnFailureListener(error -> fail("DRIVE_AUTH_FAILED"));
        });
    }

    private void finishConsent(ActivityResult result) {
        if (pending == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            fail("DRIVE_AUTH_CANCELLED");
            return;
        }
        try {
            resolveToken(Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(result.getData()));
        } catch (Exception error) {
            fail("DRIVE_AUTH_FAILED");
        }
    }

    private void resolveToken(AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            fail("DRIVE_AUTH_FAILED");
            return;
        }
        PluginCall call = pending;
        pending = null;
        JSObject value = new JSObject();
        value.put("token", token);
        call.resolve(value);
    }

    private void fail(String code) {
        PluginCall call = pending;
        pending = null;
        if (call != null) call.reject(code);
    }
}

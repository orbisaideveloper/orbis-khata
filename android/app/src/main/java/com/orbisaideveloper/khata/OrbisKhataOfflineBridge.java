package com.orbisaideveloper.khata;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Isolated Step 04–06 native bridge. This does NOT modify the SQLCipher key.
 * AES-GCM record data are encrypted with a separate hardware-backed AndroidKeystore
 * key; caller supplied scope is authenticated as AAD. No plaintext, token or PIN
 * is logged or returned after a failed authentication.
 *
 * KeyguardManager requires the user's already-configured Android credential;
 * OS biometric unlock is NOT yet implemented as a separate BiometricPrompt.
 * Unlock is an application authorization gate, not KeyStore crypto auth binding.
 */
@CapacitorPlugin(name = "OrbisKhataOfflineBridge")
public class OrbisKhataOfflineBridge extends Plugin {
    private static final String ALIAS = "orbis.khata.local.record.v1";
    private static final int MAX_BYTES = 1024 * 1024;

    private SecretKey key(boolean mayCreate) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        KeyStore.Entry entry = store.getEntry(ALIAS, null);
        SecretKey result = null;
        if (entry != null) {
            if (!(entry instanceof KeyStore.SecretKeyEntry)) throw new SecurityException("OFFLINE_KEY_INVALID");
            result = ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        if (result == null && mayCreate) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
            result = generator.generateKey();
        }
        if (result == null || !hardwareBacked(result)) throw new SecurityException("HARDWARE_OFFLINE_KEY_REQUIRED");
        return result;
    }

    private boolean hardwareBacked(SecretKey secret) throws Exception {
        if (secret == null) return false;
        SecretKeyFactory factory = SecretKeyFactory.getInstance(secret.getAlgorithm(), "AndroidKeyStore");
        KeyInfo info = (KeyInfo) factory.getKeySpec(secret, KeyInfo.class);
        if (Build.VERSION.SDK_INT >= 31) {
            return info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT
                || info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX;
        }
        return info.isInsideSecureHardware();
    }

    private String scope(PluginCall call) {
        String value = call.getString("scope");
        if (value == null || !value.matches("[A-Za-z0-9_.:-]{1,512}")) throw new SecurityException("OFFLINE_SCOPE_INVALID");
        return value;
    }

    @PluginMethod
    public synchronized void status(PluginCall call) {
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            KeyStore.Entry entry = store.getEntry(ALIAS, null);
            boolean present = entry instanceof KeyStore.SecretKeyEntry;
            boolean backed = present && hardwareBacked(((KeyStore.SecretKeyEntry)entry).getSecretKey());
            JSObject value = new JSObject();
            value.put("nativePlatform", "android");
            value.put("keyPresent", present);
            value.put("hardwareBacked", backed);
            call.resolve(value);
        } catch (Exception e) { call.reject("OFFLINE_HARDWARE_STATUS_UNAVAILABLE"); }
    }

    @PluginMethod
    public synchronized void seal(PluginCall call) {
        byte[] plain = null;
        try {
            String associated = scope(call);
            String raw = call.getString("plaintextBase64");
            if (raw == null || raw.length() > 1400000) throw new SecurityException("OFFLINE_DATA_TOO_LARGE");
            plain = Base64.decode(raw, Base64.NO_WRAP);
            if (plain.length == 0 || plain.length > MAX_BYTES) throw new SecurityException("OFFLINE_DATA_INVALID");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            SecretKey secret = key(true);
            // AndroidKeyStore IND-CPA keys forbid caller-supplied IVs during encryption.
            // Let AndroidKeyStore generate the IV; preserve nonce||ciphertext format.
            cipher.init(Cipher.ENCRYPT_MODE, secret);
            byte[] nonce = cipher.getIV();
            if (nonce == null || nonce.length != 12) throw new SecurityException("OFFLINE_NONSTANDARD_IV");
            cipher.updateAAD(associated.getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = cipher.doFinal(plain);
            byte[] result = new byte[nonce.length + ciphertext.length];
            System.arraycopy(nonce, 0, result, 0, nonce.length);
            System.arraycopy(ciphertext, 0, result, nonce.length, ciphertext.length);
            JSObject response = new JSObject();
            response.put("sealedBase64", Base64.encodeToString(result, Base64.NO_WRAP));
            response.put("hardwareBacked", true);
            call.resolve(response);
            Arrays.fill(result, (byte)0);
            Arrays.fill(ciphertext, (byte)0);
            Arrays.fill(nonce, (byte)0);
        } catch (Exception e) { call.reject("OFFLINE_HARDWARE_SEAL_FAILED"); }
        finally { if (plain != null) Arrays.fill(plain, (byte)0); }
    }

    @PluginMethod
    public synchronized void unseal(PluginCall call) {
        byte[] plain = null;
        try {
            String associated = scope(call);
            String raw = call.getString("sealedBase64");
            if (raw == null || raw.length() > 1400000) throw new SecurityException("OFFLINE_DATA_TOO_LARGE");
            byte[] sealed = Base64.decode(raw, Base64.NO_WRAP);
            if (sealed.length < 29 || sealed.length > MAX_BYTES + 28) throw new SecurityException("OFFLINE_CIPHERTEXT_INVALID");
            byte[] nonce = Arrays.copyOfRange(sealed, 0, 12);
            byte[] ciphertext = Arrays.copyOfRange(sealed, 12, sealed.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(associated.getBytes(StandardCharsets.UTF_8));
            plain = cipher.doFinal(ciphertext);
            if (plain.length == 0 || plain.length > MAX_BYTES) throw new SecurityException("OFFLINE_PLAINTEXT_INVALID");
            JSObject response = new JSObject();
            response.put("plaintextBase64", Base64.encodeToString(plain, Base64.NO_WRAP));
            call.resolve(response);
            Arrays.fill(sealed, (byte)0);
            Arrays.fill(nonce, (byte)0);
            Arrays.fill(ciphertext, (byte)0);
        } catch (Exception e) { call.reject("OFFLINE_HARDWARE_UNSEAL_FAILED"); }
        finally { if (plain != null) Arrays.fill(plain, (byte)0); }
    }

    @PluginMethod
    public void deviceLockStatus(PluginCall call) {
        KeyguardManager manager = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if (manager == null) { call.reject("OFFLINE_DEVICE_PROMPT_UNAVAILABLE"); return; }
        JSObject result = new JSObject();
        result.put("secure", manager.isDeviceSecure());
        call.resolve(result);
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        try {
            KeyguardManager manager = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
            if (manager == null || !manager.isDeviceSecure()) {
                call.reject("OFFLINE_DEVICE_LOCK_REQUIRED"); return;
            }
            Intent prompt = manager.createConfirmDeviceCredentialIntent("Unlock ORBIS Khata", "Confirm your phone's screen lock");
            if (prompt == null) { call.reject("OFFLINE_DEVICE_PROMPT_UNAVAILABLE"); return; }
            startActivityForResult(call, prompt, "onCredentialResult");
        } catch (Exception e) { call.reject("OFFLINE_DEVICE_PROMPT_FAILED"); }
    }

    @ActivityCallback
    private void onCredentialResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("unlocked", true);
            call.resolve(response);
        } else { call.reject("OFFLINE_DEVICE_CREDENTIAL_REJECTED"); }
    }
}

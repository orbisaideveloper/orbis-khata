package com.orbisaideveloper.khata;

import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Android-only, application-private SQLCipher passphrase wrapper.
 * The AES-256 wrapping key is non-exportable in AndroidKeyStore. Enforces hardware
 * backing before provisioning. No secret is logged, backed up, or persisted as plain text.
 * The SQLCipher community plugin's JS API requires the passphrase temporarily in
 * WebView memory; therefore this is NOT a claim of native-only plaintext isolation.
 * Never clear/rotate the Keystore alias when a database exists: it would be lost.
 */
@CapacitorPlugin(name = "OrbisKhataKeyBridge")
public class OrbisKhataKeyBridge extends Plugin {
    private static final String ALIAS = "orbis.khata.sqlcipher.wrap.v1";
    private static final String PREF = "orbis_khata_cipher_envelope_v1";
    private static final String IV = "iv";
    private static final String CIPHERTEXT = "sealed";
    private final SecureRandom secureRandom = new SecureRandom();

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREF, android.content.Context.MODE_PRIVATE);
    }

    private SecretKey existingKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        KeyStore.Entry entry = store.getEntry(ALIAS, null);
        if (entry == null) return null;
        if (!(entry instanceof KeyStore.SecretKeyEntry)) throw new SecurityException("KEYSTORE_ENTRY_INVALID");
        return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
    }

    private boolean isHardwareKey(SecretKey key) throws Exception {
        if (key == null) return false;
        SecretKeyFactory factory = SecretKeyFactory.getInstance(key.getAlgorithm(), "AndroidKeyStore");
        KeyInfo info = (KeyInfo) factory.getKeySpec(key, KeyInfo.class);
        // Keystore2-backed security level is reported on Android 12 and above.
        if (Build.VERSION.SDK_INT >= 31) {
            return info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT
                || info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX;
        }
        return info.isInsideSecureHardware();
    }

    private SecretKey requireHardwareKey(boolean allowCreate) throws Exception {
        SecretKey key = existingKey();
        if (key == null && allowCreate) {
            KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
            key = gen.generateKey();
        }
        if (key == null || !isHardwareKey(key)) throw new SecurityException("HARDWARE_KEYSTORE_REQUIRED");
        return key;
    }

    private boolean hasEnvelope() {
        boolean iv = prefs().contains(IV), ciphertext = prefs().contains(CIPHERTEXT);
        if (iv != ciphertext) throw new SecurityException("PARTIAL_KEY_ENVELOPE");
        return iv;
    }

    @PluginMethod
    public synchronized void status(PluginCall call) {
        try {
            SecretKey key = existingKey();
            JSObject data = new JSObject();
            data.put("hardwareBacked", isHardwareKey(key));
            data.put("secretPresent", hasEnvelope());
            data.put("nativePlatform", "android");
            call.resolve(data);
        } catch (Exception e) {
            // Never emit the exception message; provider errors may contain device data.
            call.reject("KEYSTORE_STATUS_UNAVAILABLE");
        }
    }

    /**
     * Returns a transient passphrase ONLY for the trusted local Capacitor SQLCipher API.
     * Never expose this method through a remote WebView or to arbitrary JavaScript.
     */
    @PluginMethod
    public synchronized void getOrCreatePassphrase(PluginCall call) {
        try {
            boolean exists = hasEnvelope();
            // Do NOT regenerate if an envelope exists but its wrapping key is gone.
            SecretKey key = requireHardwareKey(!exists);
            String passphrase;
            if (exists) {
                byte[] iv = Base64.decode(prefs().getString(IV, ""), Base64.NO_WRAP);
                byte[] sealed = Base64.decode(prefs().getString(CIPHERTEXT, ""), Base64.NO_WRAP);
                if (iv.length != 12 || sealed.length < 17) throw new SecurityException("KEY_ENVELOPE_INVALID");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
                passphrase = new String(cipher.doFinal(sealed), StandardCharsets.US_ASCII);
            } else {
                byte[] secret = new byte[48];
                secureRandom.nextBytes(secret);
                passphrase = Base64.encodeToString(secret, Base64.NO_WRAP | Base64.NO_PADDING);
                java.util.Arrays.fill(secret, (byte) 0);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key);
                byte[] iv = cipher.getIV();
                byte[] sealed = cipher.doFinal(passphrase.getBytes(StandardCharsets.US_ASCII));
                if (iv.length != 12) throw new SecurityException("KEYSTORE_NONSTANDARD_NONCE");
                boolean ok = prefs().edit()
                    .putString(IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                    .putString(CIPHERTEXT, Base64.encodeToString(sealed, Base64.NO_WRAP))
                    .commit();
                if (!ok) throw new SecurityException("KEY_ENVELOPE_NOT_DURABLE");
            }
            if (passphrase.length() < 48) throw new SecurityException("PASSPHRASE_INVALID");
            JSObject result = new JSObject();
            result.put("passphrase", passphrase);
            result.put("hardwareBacked", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("KEYSTORE_PROVISION_OR_UNSEAL_FAILED");
        }
    }
}

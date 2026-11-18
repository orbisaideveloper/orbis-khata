package com.orbisaideveloper.khata;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
/** Test only: delete disposable alias after reading native KeyInfo. */
public final class AndroidKeystoreCapabilityProbe {
  private AndroidKeystoreCapabilityProbe(){}
  public static String probe(){
    String alias="orbis-keystore-probe-"+UUID.randomUUID();
    KeyStore store=null;
    try {
      store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
      KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
      gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
      SecretKey key=gen.generateKey();
      KeyInfo info=(KeyInfo)SecretKeyFactory.getInstance(key.getAlgorithm(),"AndroidKeyStore").getKeySpec(key,KeyInfo.class);
      boolean hardware=Build.VERSION.SDK_INT>=31?
        info.getSecurityLevel()==KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT||
        info.getSecurityLevel()==KeyProperties.SECURITY_LEVEL_STRONGBOX:
        info.isInsideSecureHardware();
      return hardware?"HARDWARE_CONFIRMED":"SOFTWARE_ONLY";
    }catch(Exception ignored){return "PROBE_UNAVAILABLE";}
    finally{if(store!=null)try{store.deleteEntry(alias);}catch(Exception ignored){}}
  }
}

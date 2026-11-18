package com.orbisaideveloper.khata;
import android.app.Instrumentation;
import android.os.Bundle;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertTrue;
@RunWith(AndroidJUnit4.class)
public final class AndroidKeystoreCapabilityTest {
  @Test public void reportHardwareBacking(){
    String value=AndroidKeystoreCapabilityProbe.probe();
    String message="ORBIS_KEYSTORE_CAPABILITY="+value;
    Log.i("ORBIS_KEYSTORE",message);
    Bundle output=new Bundle();
    output.putString(Instrumentation.REPORT_KEY_STREAMRESULT,message+"\n");
    InstrumentationRegistry.getInstrumentation().sendStatus(0,output);
    assertTrue("Unexpected capability classification",value.equals("HARDWARE_CONFIRMED")||
      value.equals("SOFTWARE_ONLY")||value.equals("PROBE_UNAVAILABLE"));
  }
}

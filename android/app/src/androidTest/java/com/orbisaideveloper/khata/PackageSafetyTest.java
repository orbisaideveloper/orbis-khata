package com.orbisaideveloper.khata;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs on a device/emulator, not a JVM mock. No customer or backend writes. */
@RunWith(AndroidJUnit4.class)
public class PackageSafetyTest {
    @Test
    public void installedPackageRejectsBackupAndCleartext() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.orbisaideveloper.khata", context.getPackageName());
        ApplicationInfo info = context.getApplicationInfo();
        assertEquals(0, info.flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
        assertEquals(0, info.flags & ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC);
    }
}

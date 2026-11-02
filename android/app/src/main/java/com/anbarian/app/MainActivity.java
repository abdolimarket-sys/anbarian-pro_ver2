package com.anbarian.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(NativePrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

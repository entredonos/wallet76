package com.wallet76.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 9 jul 2026 — encontrado via depuração remota (chrome://inspect): os
        // pedidos da app (Dashboard, Login) estavam a ir diretos para
        // wallet76-1cvt.onrender.com em vez de passar pelo proxy same-origin
        // da Vercel (/api/...), tornando-os cross-site do ponto de vista do
        // WebView. O cookie de sessão (SameSite=None; Secure) chegava a ser
        // devolvido pelo /auth/login (200 OK), mas o WebView do Android, ao
        // contrário do Chrome normal, não aceita cookies de terceiros por
        // omissão — por isso o pedido seguinte (/portfolio, /history) ia sem
        // o cookie e dava 401 ("Sessão expirada"), mesmo o login tendo
        // corrido bem. Isto ativa explicitamente a aceitação desses cookies
        // no WebView desta app, independentemente de o pedido acabar por ir
        // direto ao Render ou pelo proxy da Vercel.
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            cookieManager.setAcceptThirdPartyCookies(this.bridge.getWebView(), true);
        }
    }
}

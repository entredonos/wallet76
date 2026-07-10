package com.wallet76.app;

import android.app.Activity;
import android.os.Build;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 10 jul 2026 — substitui @capgo/capacitor-native-biometric para o gate de
 * desbloqueio (LockScreen/Settings). Motivo: aquele plugin liga sempre o
 * BiometricPrompt a um CryptoObject (mesmo no modo "verify" simples, sem
 * guardar credenciais nenhumas), e o Android proíbe isso em sensores
 * classificados como "Class 2 (Weak)" — comum em vários Samsung — com
 * java.lang.IllegalArgumentException: "Crypto-based authentication is not
 * supported for Class 2 (Weak) biometrics", que crasha a app inteira ao
 * abrir o AuthActivity (confirmado via logcat: FATAL EXCEPTION logo em
 * BiometricPrompt.authenticate()). Já confirmámos (lendo o código-fonte das
 * versões 8.4.10 e 8.6.0 do plugin) que ambas têm este mesmo problema — não
 * é um bug pontual de uma versão específica, é estrutural.
 *
 * A nossa sessão já está autenticada via cookie httpOnly — este ecrã é só
 * um gate de conveniência local ("confirma que és o dono do aparelho"), não
 * a fronteira de segurança real. Por isso não precisamos de CryptoObject
 * nenhum: um BiometricPrompt.authenticate(promptInfo) simples, sem chave
 * criptográfica associada, funciona em qualquer classe de biometria
 * (fraca ou forte) e evita este crash por construção.
 */
@CapacitorPlugin(name = "SimpleBiometric")
public class SimpleBiometricPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Activity activity = getActivity();
        JSObject ret = new JSObject();
        if (activity == null) {
            ret.put("isAvailable", false);
            call.resolve(ret);
            return;
        }
        BiometricManager manager = BiometricManager.from(activity);
        int result = manager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK
        );
        ret.put("isAvailable", result == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void verify(PluginCall call) {
        Activity activity = getActivity();
        if (!(activity instanceof FragmentActivity)) {
            call.reject("Activity não suporta BiometricPrompt");
            return;
        }
        FragmentActivity fragmentActivity = (FragmentActivity) activity;
        String reason = call.getString("reason", "Confirma a tua identidade");
        String title = call.getString("title", "Wallet76");
        String subtitle = call.getString("subtitle", null);
        String negativeButtonText = call.getString("negativeButtonText", "Cancelar");

        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setDescription(reason)
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK
                )
                .setNegativeButtonText(negativeButtonText);
            if (subtitle != null) builder.setSubtitle(subtitle);

            BiometricPrompt prompt = new BiometricPrompt(
                fragmentActivity,
                ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(androidx.biometric.BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        call.resolve();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);
                        call.reject(errString != null ? errString.toString() : "Falha na biometria", String.valueOf(errorCode));
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                        // Não rejeita já — deixa o próprio BiometricPrompt do sistema mostrar
                        // "não reconhecido" e permitir nova tentativa, até ao próprio limite do
                        // Android (que despoleta onAuthenticationError com ERROR_LOCKOUT).
                    }
                }
            );

            prompt.authenticate(builder.build());
        });
    }
}

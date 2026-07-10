import { registerPlugin } from "@capacitor/core";

// 10 jul 2026 — plugin nativo próprio (ver
// android/app/src/main/java/com/wallet76/app/SimpleBiometricPlugin.java),
// substitui @capgo/capacitor-native-biometric para o gate de desbloqueio.
// Esse plugin liga sempre o BiometricPrompt a um CryptoObject, mesmo no
// modo "verify" sem nenhuma credencial guardada — e o Android proíbe isso
// em sensores "Class 2 (Weak)" (comum em vários Samsung), crashando a app
// inteira. Confirmámos via logcat + leitura do código-fonte de duas versões
// do plugin (8.4.10 e 8.6.0) que é um problema estrutural, não uma versão
// específica com bug. Este plugin próprio faz só o essencial: um
// BiometricPrompt sem chave criptográfica associada, que funciona em
// qualquer classe de biometria — a sessão já está autenticada via cookie
// httpOnly, isto é só um gate de conveniência local.
export const SimpleBiometric = registerPlugin("SimpleBiometric");

/** @returns {Promise<{isAvailable: boolean}>} */
export function isAvailable() {
  return SimpleBiometric.isAvailable();
}

/**
 * Resolves on success, rejects (with .message) on failure/cancel.
 * @param {{reason?: string, title?: string, subtitle?: string, negativeButtonText?: string}} opts
 */
export function verify(opts = {}) {
  return SimpleBiometric.verify(opts);
}

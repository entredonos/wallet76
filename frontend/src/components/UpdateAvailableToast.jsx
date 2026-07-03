import { useEffect } from "react";
import { toast } from "sonner";
import { useI18n } from "../context/I18nContext";

/**
 * Listens for the "sw:update-available" event dispatched by
 * serviceWorkerRegistration.js whenever a new service worker has finished
 * installing in the background (i.e. a new deploy went out while this tab
 * was open). Without this, the new code sits waiting silently — the user
 * keeps running the old bundle until they happen to fully close and reopen
 * every tab, which is how "já fiz deploy mas nada mudou" reports like the
 * missing Mercado info icon (3 jul 2026) kept happening even after several
 * redeploys. A persistent toast with a reload button makes the update
 * explicit and one click away instead of invisible.
 */
export default function UpdateAvailableToast() {
  const { t } = useI18n();

  useEffect(() => {
    const onUpdate = () => {
      toast(t("app.update_available"), {
        duration: Infinity,
        action: {
          label: t("app.update_reload"),
          onClick: () => window.location.reload(),
        },
      });
    };
    window.addEventListener("sw:update-available", onUpdate);
    return () => window.removeEventListener("sw:update-available", onUpdate);
  }, [t]);

  return null;
}

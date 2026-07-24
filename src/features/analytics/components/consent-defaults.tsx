// src/features/analytics/components/consent-defaults.tsx

import Script from "next/script";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, DENIED, type ConsentState } from "@/features/analytics/lib/consent";

export async function ConsentDefaults() {
  const stored = (await cookies()).get(CONSENT_COOKIE)?.value;
  const consent: ConsentState = stored ? { ...DENIED, ...safeParse(stored) } : DENIED;

  // Consent Mode v2 signals. Reading the cookie server-side means a
  // returning visitor's choice is applied in the very first script,
  // avoiding a flash of denied-then-granted on every page load.
  const state = {
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.personalization ? "granted" : "denied",
    analytics_storage: consent.analytics ? "granted" : "denied",
    functionality_storage: "granted",
    security_storage: "granted",
  };

  return (
    <Script id="consent-defaults" strategy="beforeInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('consent', 'default', ${JSON.stringify({ ...state, wait_for_update: 500 })});
      `}
    </Script>
  );
}

function safeParse(value: string): Partial<ConsentState> {
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return {};
  }
}

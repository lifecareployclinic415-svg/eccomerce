// src/features/analytics/components/analytics-scripts.tsx

"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, DENIED, type ConsentState } from "@/features/analytics/lib/consent";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/**
 * Tag loading, gated on consent.
 *
 * Two different mechanisms, because the vendors behave differently:
 *
 *   GTM / GA4 — loaded always, but governed by Consent Mode v2. With
 *     analytics_storage denied they send cookieless pings only, which is
 *     what preserves Google's conversion modelling. Blocking the script
 *     entirely actually loses more signal than denying storage.
 *
 *   Meta Pixel / Clarity — NOT loaded at all until consent. Meta's own
 *     guidance is explicit that fbevents.js and fbq('init') must sit
 *     behind the gate, with no pre-consent PageView. Clarity records
 *     session replay, which is unambiguously personal data.
 */
export function AnalyticsScripts() {
  const [consent, setConsent] = useState<ConsentState>(DENIED);

  useEffect(() => {
    setConsent(readConsentCookie());
    const onChange = (event: Event) => setConsent((event as CustomEvent<ConsentState>).detail);
    window.addEventListener("consent-changed", onChange);
    return () => window.removeEventListener("consent-changed", onChange);
  }, []);

  return (
    <>
      {/* Consent Mode governs behaviour; the container itself may load. */}
      {GTM_ID && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      )}

      {/* Only load gtag directly if you are NOT routing GA4 through GTM —
          doing both double-counts every event. */}
      {GA_ID && !GTM_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: true });`}
          </Script>
        </>
      )}

      {CLARITY_ID && consent.analytics && (
        // lazyOnload: session replay is never worth competing with the
        // storefront for main-thread time during load.
        <Script id="clarity" strategy="lazyOnload">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window,document,"clarity","script","${CLARITY_ID}");`}
        </Script>
      )}

      {META_PIXEL_ID && consent.marketing && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');`}
        </Script>
      )}
    </>
  );
}

function readConsentCookie(): ConsentState {
  const match = document.cookie.match(new RegExp(`${CONSENT_COOKIE}=([^;]+)`));
  if (!match) return DENIED;
  try {
    return { ...DENIED, ...JSON.parse(decodeURIComponent(match[1]!)) };
  } catch {
    return DENIED;
  }
}

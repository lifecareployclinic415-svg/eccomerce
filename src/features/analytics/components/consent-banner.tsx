// src/features/analytics/components/consent-banner.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { recordConsentAction } from "@/features/analytics/actions/consent.actions";
import { CONSENT_COOKIE, DENIED, GRANTED, type ConsentState } from "@/features/analytics/lib/consent";

/**
 * DPDP requires consent to be AFFIRMATIVE and SPECIFIC. Three consequences
 * are visible in this component:
 *
 *   • No pre-ticked boxes — every toggle starts off.
 *   • "Reject all" is as prominent as "Accept all". Burying rejection
 *     behind a settings page is precisely the dark pattern regulators
 *     have been fining.
 *   • Continuing to browse grants nothing. There is no dismiss-by-scroll.
 *
 * Withdrawal must be as easy as granting, so the footer links back here.
 */
export function ConsentBanner() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [choices, setChoices] = useState<ConsentState>(DENIED);

  useEffect(() => {
    const decided = document.cookie.includes(`${CONSENT_COOKIE}=`);
    if (!decided) setOpen(true);

    // Lets the footer "Cookie preferences" link reopen this.
    const reopen = () => { setCustomizing(true); setOpen(true); };
    window.addEventListener("open-consent-preferences", reopen);
    return () => window.removeEventListener("open-consent-preferences", reopen);
  }, []);

  const apply = async (state: ConsentState, action: "accept_all" | "reject_all" | "custom") => {
    // 1. Update Consent Mode immediately so tags react in this pageview.
    window.gtag?.("consent", "update", {
      ad_storage: state.marketing ? "granted" : "denied",
      ad_user_data: state.marketing ? "granted" : "denied",
      ad_personalization: state.personalization ? "granted" : "denied",
      analytics_storage: state.analytics ? "granted" : "denied",
    });

    // 2. Tell any listening scripts (Clarity, Meta) to start or stay off.
    window.dispatchEvent(new CustomEvent("consent-changed", { detail: state }));

    // 3. Persist for future visits and write the audit record.
    await recordConsentAction({ ...state, action });
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-label="Privacy preferences"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-line bg-surface/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6"
        >
          <h2 className="font-sans text-base font-semibold">Your privacy choices</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            We use cookies that are necessary to run this shop. With your permission we'd
            also like to measure how the site is used and show you relevant offers. You can
            change or withdraw this at any time.{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
              Read our privacy policy
            </Link>
            .
          </p>

          <AnimatePresence initial={false}>
            {customizing && (
              <motion.div
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <Row
                    title="Strictly necessary"
                    body="Sign-in, your bag and checkout. These cannot be turned off."
                    checked
                    disabled
                  />
                  <Row
                    title="Analytics"
                    body="How many people visit and which pages they use."
                    checked={choices.analytics}
                    onChange={(v) => setChoices((c) => ({ ...c, analytics: v }))}
                  />
                  <Row
                    title="Marketing"
                    body="Measuring ad performance and showing offers off-site."
                    checked={choices.marketing}
                    onChange={(v) => setChoices((c) => ({ ...c, marketing: v }))}
                  />
                  <Row
                    title="Personalization"
                    body="Recommendations based on what you've viewed."
                    checked={choices.personalization}
                    onChange={(v) => setChoices((c) => ({ ...c, personalization: v }))}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {customizing ? (
              <Button onClick={() => apply(choices, "custom")} className="bg-brand text-on-brand hover:bg-brand-hover sm:flex-1">
                Save my choices
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setCustomizing(true)} className="sm:flex-1">
                Customize
              </Button>
            )}

            {/* Equal weight, deliberately. */}
            <Button variant="outline" onClick={() => apply(DENIED, "reject_all")} className="sm:flex-1">
              Reject all
            </Button>
            <Button onClick={() => apply(GRANTED, "accept_all")} className="bg-brand text-on-brand hover:bg-brand-hover sm:flex-1">
              Accept all
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  title, body, checked, disabled, onChange,
}: {
  title: string; body: string; checked: boolean; disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-ink-soft">{body}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

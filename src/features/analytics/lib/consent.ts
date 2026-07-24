export type ConsentState = {
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
};

export const CONSENT_COOKIE = "consent_state";
export const VISITOR_COOKIE = "visitor_id";

/** Bump whenever the banner wording or the purposes change. */
export const POLICY_VERSION = "2026-01-v1";

export const DENIED: ConsentState = {
  analytics: false,
  marketing: false,
  personalization: false,
};

export const GRANTED: ConsentState = {
  analytics: true,
  marketing: true,
  personalization: true,
};

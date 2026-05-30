/**
 * config.ts — app-level contact / legal config.
 *
 * Centralized so a future privacy-policy page, footer, or settings UI can
 * reference a single source of truth. (v1.9.0)
 *
 * NOTE: the actual privacy@ mailbox/alias is a DNS/email-provider setup — a
 * manual step for Ben, not a code task. This constant only makes the address
 * available to the app; it must exist before it appears in a published policy.
 */

export const PRIVACY_CONTACT_EMAIL = 'privacy@avow.wedding';

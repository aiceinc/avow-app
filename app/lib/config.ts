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

/**
 * localStorage key for the user's last-selected workspace. The app shell
 * (`(app)/layout.tsx`) reads it on load; the toolbar's workspace switcher and
 * the new-wedding flow write it. Single source of truth so the two can't drift.
 */
export const WORKSPACE_STORAGE_KEY = 'avow:workspaceId';

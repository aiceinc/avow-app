/**
 * /privacy — public privacy policy (v1.9.1).
 *
 * PUBLIC, OUTSIDE the (app) auth guard (sits alongside app/w/[slug]) so anyone —
 * waitlist visitors, guests, logged-out users — can read it without signing in.
 *
 * CONTENT PROVENANCE: this is a one-time, baked-in copy of the interim policy at
 * `C:\Users\bende\Documents\AICE\Avow_Privacy_Policy.md` (Last updated June 1, 2026).
 * It is intentionally NOT fetched/synced at runtime. When Brooke's final policy
 * lands, replace the JSX below in a deliberate one-time content update and bump
 * the "Last updated" date. Keep this in sync with the landing site's privacy.html.
 */

import Link from 'next/link';
import Wordmark from '@/app/components/Wordmark';
import AppFooter from '@/app/components/AppFooter';

const MAIL = 'privacy@avow.wedding';

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-xl text-ink mt-10 mb-3">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-ink-soft leading-relaxed mb-4">{children}</p>;
}

function Mail() {
  return (
    <a href={`mailto:${MAIL}`} className="text-accent hover:underline">
      {MAIL}
    </a>
  );
}

export const metadata = {
  title: 'Privacy Policy — Avow',
  description: 'How AICE Inc. collects, uses, and protects personal information in connection with Avow.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Slim top bar */}
      <header className="flex items-center px-6 py-4 border-b border-rule">
        <Link href="/" aria-label="Avow home" className="hover:opacity-80 transition-opacity">
          <Wordmark className="text-lg" />
        </Link>
      </header>

      <main className="flex-1">
        <article className="max-w-3xl mx-auto w-full px-6 py-14">
          <h1 className="font-serif font-light text-4xl text-ink leading-tight">Avow Privacy Policy</h1>
          <p className="text-sm text-ink-faint mt-3">Last updated: June 1, 2026</p>

          <div className="mt-8">
            <P>
              This Privacy Policy explains how AICE Inc. (&ldquo;AICE,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
              or &ldquo;our&rdquo;) collects, uses, shares, and protects personal information in connection with{' '}
              <strong className="text-ink font-medium">Avow</strong>, our wedding-planning service. It applies to
              our marketing site at <strong className="text-ink font-medium">avow.wedding</strong> and our app at{' '}
              <strong className="text-ink font-medium">app.avow.wedding</strong>, including the public
              wedding-website and RSVP pages that a couple can choose to publish.
            </P>
            <P>
              We are based in Toronto, Ontario, Canada, and we handle personal information in accordance with
              Canada&rsquo;s federal <strong className="text-ink font-medium">Personal Information Protection and
              Electronic Documents Act (PIPEDA)</strong> and its fair-information principles. Our email practices
              follow Canada&rsquo;s Anti-Spam Legislation (CASL).
            </P>

            <H2>1. Who we are and how to reach us</H2>
            <P>
              Avow is operated by <strong className="text-ink font-medium">AICE Inc.</strong> (incorporation
              pending), with a registered office at <strong className="text-ink font-medium">1206–181 Bedford Road,
              Toronto, Ontario M5R 0C2, Canada</strong>.
            </P>
            <P>
              We are responsible for the personal information under our control, including information handled on our
              behalf by the service providers described below. If you have any question or request about your
              privacy, contact us at <Mail />.
            </P>

            <H2>2. The personal information we collect</H2>
            <P>We collect different information depending on how you use Avow.</P>
            <P>
              <strong className="text-ink font-medium">When you join our waitlist (avow.wedding).</strong> We
              collect your <strong className="text-ink font-medium">email address</strong> so we can update you
              about Avow. That is the only information the waitlist form collects.
            </P>
            <P>
              <strong className="text-ink font-medium">When you create and use an Avow account.</strong> We collect:
            </P>
            <ul className="list-disc pl-5 space-y-2 text-[15px] text-ink-soft leading-relaxed mb-4">
              <li>
                <strong className="text-ink font-medium">Account and sign-in information</strong> — your email
                address, your password (stored securely), and the session information that keeps you signed in.
              </li>
              <li>
                <strong className="text-ink font-medium">Workspace information</strong> — the name you give your
                wedding workspace (which often includes the couple&rsquo;s names) and any invite codes used to share
                the workspace with a partner.
              </li>
              <li>
                <strong className="text-ink font-medium">Wedding-planning content you enter</strong> — this may
                include your guest list (guest names, &ldquo;side,&rdquo; dietary notes, RSVP status, and plus-one
                details); vendor records (a vendor&rsquo;s business name and contact name, email, phone, and
                website); budget amounts and line items; a day-of timeline (which can include a &ldquo;responsible
                party&rdquo; you name); and seating arrangements.
              </li>
              <li>
                <strong className="text-ink font-medium">Wedding-website content you publish</strong> — if you
                choose to publish a wedding website, the content you add to it, such as couple names, wedding date,
                venue, your story, travel notes, and a public schedule. Wedding websites are private until you
                publish them.
              </li>
            </ul>
            <P>
              <strong className="text-ink font-medium">When you respond to an invitation as a guest.</strong> If a
              couple shares a personal invite link with you, you can submit an{' '}
              <strong className="text-ink font-medium">RSVP</strong> without creating an account. Through that link
              we collect your <strong className="text-ink font-medium">RSVP status, dietary notes, and plus-one
              name</strong>. Each invite link contains a unique token so that only the intended guest can respond.
            </P>
            <P>
              <strong className="text-ink font-medium">Information collected automatically.</strong> When you use
              our sites and app, our hosting and infrastructure providers generate standard{' '}
              <strong className="text-ink font-medium">server logs</strong>, which include technical details such as{' '}
              <strong className="text-ink font-medium">IP addresses</strong>, to operate and secure the service. We
              do <strong className="text-ink font-medium">not</strong> use third-party analytics or advertising
              trackers, and we use <strong className="text-ink font-medium">only the essential cookies</strong>{' '}
              needed to sign you in and keep you signed in.
            </P>

            <H2>3. Information about your guests and vendors</H2>
            <P>
              Because Avow helps you plan a wedding, you may enter personal information about{' '}
              <strong className="text-ink font-medium">other people</strong> — your guests and your vendors — and
              your guests may submit their own RSVP details through an invite link. We store this information as part
              of your workspace and use it only to provide the planning features you&rsquo;ve asked for (managing
              guests and RSVPs, seating, vendors, and your wedding website).
            </P>
            <P>
              If you enter information about other people, you are responsible for doing so appropriately and, where
              needed, for letting them know. If you are a guest or vendor and would like to know what information
              about you we hold, or want it corrected or removed, contact us at <Mail /> and we will help, working
              with the couple where necessary.
            </P>

            <H2>4. How we use personal information</H2>
            <P>We use personal information to:</P>
            <ul className="list-disc pl-5 space-y-2 text-[15px] text-ink-soft leading-relaxed mb-4">
              <li>create and operate your account and wedding workspace;</li>
              <li>provide Avow&rsquo;s planning features (guests and RSVPs, seating, budget, vendors, and timeline);</li>
              <li>let you publish a wedding website and collect RSVPs from your guests;</li>
              <li>send you necessary account and service messages, such as sign-in, verification, and security notices;</li>
              <li>keep you informed about Avow if you&rsquo;ve joined our waitlist;</li>
              <li>operate, secure, troubleshoot, and improve the service; and</li>
              <li>comply with our legal obligations.</li>
            </ul>
            <P>
              We collect only what we need for these purposes, use it only for the purposes for which it was
              collected (or as you otherwise agree, or as the law permits or requires), and{' '}
              <strong className="text-ink font-medium">we do not sell personal information</strong>.
            </P>

            <H2>5. Consent</H2>
            <P>
              We rely on your consent to collect, use, and share your personal information for the purposes above.
              When you create an account and use Avow, or when you submit an RSVP through an invite link, you provide
              that consent for the information involved. You may withdraw your consent at any time, subject to legal
              and contractual limits, by contacting <Mail />; we&rsquo;ll explain what withdrawing consent means for
              your use of the service.
            </P>
            <P>
              For marketing emails — such as waitlist updates — we send them on the basis of your sign-up, we
              identify ourselves and include our contact information in each message, and every message includes a
              working unsubscribe link. You can unsubscribe at any time, and we will stop promptly.
            </P>

            <H2>6. How we share personal information</H2>
            <P>
              We do not sell personal information. We share it only with service providers who process it on our
              behalf to run Avow, and only as needed to provide the service:
            </P>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-[15px] text-ink-soft border border-rule rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-bg-tint text-ink text-left">
                    <th className="px-4 py-2.5 font-medium border-b border-rule">Service provider</th>
                    <th className="px-4 py-2.5 font-medium border-b border-rule">Role</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2.5 border-b border-rule align-top"><strong className="text-ink font-medium">Convex</strong></td>
                    <td className="px-4 py-2.5 border-b border-rule">Database and backend that stores your Avow app data</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 border-b border-rule align-top"><strong className="text-ink font-medium">Vercel</strong></td>
                    <td className="px-4 py-2.5 border-b border-rule">Hosts and serves the Avow app</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 border-b border-rule align-top"><strong className="text-ink font-medium">Cloudflare</strong></td>
                    <td className="px-4 py-2.5 border-b border-rule">Hosts our marketing site, provides DNS, and routes our email</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 align-top"><strong className="text-ink font-medium">Resend</strong></td>
                    <td className="px-4 py-2.5">Sends our waitlist and service emails</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <P>
              These providers are located in the <strong className="text-ink font-medium">United States</strong> and
              may store and process personal information there. We require them to protect personal information and
              to use it only to provide services to us. Our email provider, Resend, processes data under a
              data-processing agreement that includes Standard Contractual Clauses and Data Privacy Framework
              safeguards and deletes data within 90 days after an account is terminated.
            </P>
            <P>
              We may also disclose personal information where required or permitted by law, or in connection with a
              business transaction such as a financing, merger, or sale, in which case we will require appropriate
              protection for the information.
            </P>

            <H2>7. Where your information is processed</H2>
            <P>
              Avow is operated from Canada, and we follow PIPEDA in handling your personal information. Some of our
              service providers store and process personal information in the{' '}
              <strong className="text-ink font-medium">United States</strong> (and possibly other countries). When
              personal information is processed in another country, it may be accessible to the courts, law
              enforcement, and authorities of that country under its laws.
            </P>

            <H2>8. Cookies</H2>
            <P>
              We use <strong className="text-ink font-medium">only essential cookies</strong> — specifically, the
              session cookie that signs you in and keeps you signed in while you use the app. We do not use
              analytics, advertising, or tracking cookies.
            </P>

            <H2>9. How long we keep information, and deleting your data</H2>
            <P>
              You can <strong className="text-ink font-medium">delete your account and its data at any time</strong>{' '}
              from the Account page in the app. This permanently and irreversibly removes your account and your
              wedding workspace. Where two partners share a workspace, the shared workspace is removed once no
              members remain, so deleting your own account won&rsquo;t erase a shared wedding for your partner.
            </P>
            <P>
              We keep personal information only as long as it&rsquo;s needed for the purposes described in this
              policy. If a paid subscription ends, we delete the associated workspace data after a short grace period
              of about <strong className="text-ink font-medium">30 days</strong>, so an accidental lapse
              doesn&rsquo;t cause immediate loss. We keep waitlist email addresses until you unsubscribe.
            </P>

            <H2>10. Your privacy rights</H2>
            <P>You have the right to:</P>
            <ul className="list-disc pl-5 space-y-2 text-[15px] text-ink-soft leading-relaxed mb-4">
              <li><strong className="text-ink font-medium">access</strong> the personal information we hold about you and learn how we&rsquo;ve used and shared it;</li>
              <li>ask us to <strong className="text-ink font-medium">correct</strong> information that is inaccurate or incomplete; and</li>
              <li><strong className="text-ink font-medium">withdraw your consent</strong> or ask us to delete your information, subject to legal and contractual limits.</li>
            </ul>
            <P>
              To make a request, email <Mail />. We may need to verify your identity before responding. If your
              request concerns information about a guest or vendor that a couple entered, we may need to coordinate
              with that couple. We will respond within a reasonable time and within the timeframes required by law.
            </P>

            <H2>11. How we protect your information</H2>
            <P>
              We use security measures appropriate to the sensitivity of the information, including access controls,
              reputable infrastructure providers, and a dedicated mechanism for managing account credentials. While
              no online service can be completely secure, we work to protect personal information against loss,
              theft, and unauthorized access, use, or disclosure.
            </P>

            <H2>12. Keeping your information accurate</H2>
            <P>
              You can keep most of your information accurate yourself by editing it directly in the app. If you need
              help correcting anything else, contact us at <Mail />.
            </P>

            <H2>13. Children</H2>
            <P>
              Avow accounts are intended for people <strong className="text-ink font-medium">18 years of age or
              older</strong>, and Avow is not directed at children. Guests who RSVP through a public invite link are
              not asked to create an account; couples are responsible for the information they choose to include
              about their guests, which may include minors.
            </P>

            <H2>14. Changes to this policy</H2>
            <P>
              We may update this Privacy Policy from time to time. When we do, we&rsquo;ll post the updated version
              here and change the &ldquo;Last updated&rdquo; date above. If we make a significant change, we&rsquo;ll
              take reasonable steps to let you know.
            </P>

            <H2>15. Contact us and how to raise a concern</H2>
            <P>
              For any privacy question or request, or to raise a concern about how we handle your personal
              information, contact us at <Mail /> or by mail at our registered office above. If we&rsquo;re unable to
              resolve your concern, you may contact the{' '}
              <strong className="text-ink font-medium">Office of the Privacy Commissioner of Canada</strong>{' '}
              (
              <a href="https://priv.gc.ca" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                priv.gc.ca
              </a>
              ).
            </P>
          </div>
        </article>
      </main>

      <AppFooter />
    </div>
  );
}

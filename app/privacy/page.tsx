/**
 * /privacy — public privacy policy (v1.10.5).
 *
 * PUBLIC, OUTSIDE the (app) auth guard (sits alongside app/w/[slug]) so anyone —
 * waitlist visitors, guests, logged-out users — can read it without signing in.
 *
 * Renders the baked-in policy Markdown (app/privacy/policy.ts — Brooke's draft,
 * Last updated June 1, 2026) via react-markdown. NOT fetched at runtime. To
 * update, edit policy.ts and keep the landing site's privacy.html in sync.
 */

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Wordmark from '@/app/components/Wordmark';
import AppFooter from '@/app/components/AppFooter';
import { PRIVACY_POLICY_MD } from './policy';

export const metadata = {
  title: 'Privacy Policy — Avow',
  description: 'How Avow Inc. collects, uses, discloses, retains, and protects personal information.',
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
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="font-serif font-light text-4xl text-ink leading-tight mb-2">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="font-serif text-xl text-ink mt-10 mb-3">{children}</h2>
              ),
              p: ({ children }) => (
                <p className="text-[15px] text-ink-soft leading-relaxed mb-4">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-5 space-y-1.5 mb-4 text-[15px] text-ink-soft">{children}</ul>
              ),
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              strong: ({ children }) => <strong className="text-ink font-medium">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              a: ({ href, children }) => (
                <a href={href} className="text-accent hover:underline">{children}</a>
              ),
              hr: () => <hr className="border-rule my-10" />,
              table: ({ children }) => (
                <div className="overflow-x-auto my-6">
                  <table className="w-full text-sm border-collapse">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="text-left font-medium text-ink border border-rule px-3 py-2 bg-bg-tint/50 align-top">{children}</th>
              ),
              td: ({ children }) => (
                <td className="text-ink-soft border border-rule px-3 py-2 align-top leading-relaxed">{children}</td>
              ),
            }}
          >
            {PRIVACY_POLICY_MD}
          </ReactMarkdown>
        </article>
      </main>

      <AppFooter />
    </div>
  );
}

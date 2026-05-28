/**
 * ComingSoon — calm, branded placeholder for modules that aren't built yet.
 * Mirrors the landing page's "coming soon" treatment (accent eyebrow, Fraunces
 * headline) so a logged-in user sees something intentional, not broken.
 */
export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md animate-fade-in">
        <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-3">
          Coming soon
        </p>
        <h1 className="font-serif font-light text-3xl text-ink mb-3">{title}</h1>
        <p className="text-sm text-ink-soft leading-relaxed">{description}</p>
        <div className="mt-8 text-ink-faint">—</div>
      </div>
    </div>
  );
}

/**
 * Wordmark — the Avow logo: "avow" in Fraunces with a small gold dot.
 * Mirrors the mark used on the landing site (avow.wedding).
 * Size is controlled by the font-size utility passed in `className`
 * (e.g. "text-lg", "text-2xl"); the dot scales with it.
 */
export default function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      avow<span className="dot" />
    </span>
  );
}

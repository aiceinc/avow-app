/**
 * ObjectIcon — line-art symbols for the seating-planner "Add object" presets
 * (v1.18.1). Keyed by the preset key (see app/lib/objects.ts). Inherits color
 * via currentColor and sizes to the `size` prop.
 */

export default function ObjectIcon({ name, size = 20 }: { name: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'cake':
      return (
        <svg {...p} aria-hidden>
          <path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7Z" />
          <path d="M4 15.5c1.6 1.2 3.2 1.2 4 0s2-1.2 2 0 2 1.2 2 0 2-1.2 2 0 2.4 1.2 4 0" />
          <path d="M12 9V5.5" />
          <circle cx="12" cy="4.4" r="0.7" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'gift':
      return (
        <svg {...p} aria-hidden>
          <rect x="4.5" y="11" width="15" height="9" rx="1" />
          <path d="M3.5 8h17v3h-17z" />
          <path d="M12 8v12" />
          <path d="M12 8C10.5 8 8.5 7.4 8.5 6S11 4.5 12 8Zm0 0c1.5 0 3.5-.6 3.5-2S13 4.5 12 8Z" />
        </svg>
      );
    case 'guestbook':
      return (
        <svg {...p} aria-hidden>
          <path d="M12 6.5v13" />
          <path d="M12 6.5c-1.8-1.2-4.4-1.2-6 0v11.5c1.6-1.2 4.2-1.2 6 0" />
          <path d="M12 6.5c1.8-1.2 4.4-1.2 6 0v11.5c-1.6-1.2-4.2-1.2-6 0" />
        </svg>
      );
    case 'bar':
      return (
        <svg {...p} aria-hidden>
          <path d="M5 5.5h14l-7 7.5z" />
          <path d="M12 13v6" />
          <path d="M8.5 19h7" />
          <path d="M16 6.5l2.5-1.6" />
          <circle cx="19" cy="4.4" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'stage':
      return (
        <svg {...p} aria-hidden>
          <path d="M3 18l4-9.5h10L21 18Z" />
          <path d="M3 18h18" />
          <path d="M12 8.5V5" />
          <circle cx="12" cy="4" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'dancefloor':
      return (
        <svg {...p} aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="1" />
          <path d="M12 4v16M4 12h16" />
          <rect x="4" y="4" width="8" height="8" fill="currentColor" stroke="none" opacity="0.18" />
          <rect x="12" y="12" width="8" height="8" fill="currentColor" stroke="none" opacity="0.18" />
        </svg>
      );
    case 'djband':
      return (
        <svg {...p} aria-hidden>
          <path d="M9.4 18V6l10-2v12" />
          <circle cx="7" cy="18" r="2.6" fill="currentColor" stroke="none" />
          <circle cx="17" cy="16" r="2.6" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...p} aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
  }
}

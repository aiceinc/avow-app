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
      // Raised stage platform with front steps
      return (
        <svg {...p} aria-hidden>
          <rect x="3" y="8.5" width="18" height="4" rx="0.5" />
          <rect x="6.5" y="12.5" width="11" height="3.2" />
          <rect x="9.5" y="15.7" width="5" height="3.2" />
        </svg>
      );
    case 'altar':
      // Wedding arch / altar
      return (
        <svg {...p} aria-hidden>
          <path d="M5.5 20V9.5" />
          <path d="M18.5 20V9.5" />
          <path d="M5.5 9.5C5.5 5.9 8.4 3.5 12 3.5s6.5 2.4 6.5 6" />
          <path d="M4 20h16" />
        </svg>
      );
    case 'dancefloor':
      // Disco ball
      return (
        <svg {...p} aria-hidden>
          <path d="M12 3.5V6" />
          <circle cx="12" cy="13" r="7" />
          <path d="M9 6.7V19.3" />
          <path d="M12 6V20" />
          <path d="M15 6.7V19.3" />
          <path d="M5.7 10H18.3" />
          <path d="M5 13H19" />
          <path d="M5.7 16H18.3" />
        </svg>
      );
    case 'djband':
      // DJ deck — two record platters with dials below
      return (
        <svg {...p} aria-hidden>
          <rect x="2.5" y="5" width="19" height="14" rx="1.5" />
          <circle cx="7.5" cy="10.5" r="3.1" />
          <circle cx="7.5" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="10.5" r="3.1" />
          <circle cx="16.5" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="6" cy="16" r="1" />
          <circle cx="12" cy="16" r="1" />
          <circle cx="18" cy="16" r="1" />
        </svg>
      );
    default:
      // Generic object — plain square
      return (
        <svg {...p} aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      );
  }
}

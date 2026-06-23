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
      // Podium / lectern
      return (
        <svg {...p} aria-hidden>
          <path d="M7.5 6h9v1.6l-1 1H8.5l-1-1z" />
          <path d="M9 8.6h6l-1.3 7.4h-3.4z" />
          <path d="M10 16h4l1 3h-6z" />
          <path d="M7 19.5h10" />
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
      // DJ turntable
      return (
        <svg {...p} aria-hidden>
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <circle cx="10" cy="12" r="4.3" />
          <circle cx="10" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <path d="M18.5 7.5l-4.8 3.1" />
          <circle cx="18.7" cy="7.3" r="0.9" fill="currentColor" stroke="none" />
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

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
      // Concert stage — peaked canopy roof, X-braced truss towers, lighting
      // truss with hanging lights, and a stepped platform base.
      return (
        <svg {...p} aria-hidden>
          <path d="M3 10 L3.5 8 L12 5.5 L20.5 8 L21 10 Z" />
          <path d="M4 10.2V17.8 M6 10.2V17.8 M4 10.2H6 M4 14H6 M4 17.8H6 M4 10.2L6 14 M6 10.2L4 14 M4 14L6 17.8 M6 14L4 17.8 M18 10.2V17.8 M20 10.2V17.8 M18 10.2H20 M18 14H20 M18 17.8H20 M18 10.2L20 14 M20 10.2L18 14 M18 14L20 17.8 M20 14L18 17.8" />
          <path d="M6 10.9H18 M6 11.9H18 M9 11.9V13 M12 11.9V13.2 M15 11.9V13" />
          <path d="M2.5 17.8H21.5V19.4H2.5Z M7 19.4H17V20.6H7Z M9 20.6H15V21.8H9Z" />
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

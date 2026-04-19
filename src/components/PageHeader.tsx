"use client";
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  icon: LucideIcon;
  /** Hex color (#RRGGBB). Used for both the icon stroke and a 13%-opacity tint behind it. */
  color: string;
  title: string;
  /** Optional right-side slot for buttons (Today, New, theme toggle, etc.). */
  right?: ReactNode;
}

/**
 * Unified page header: a colored icon chip + a title, with an optional slot
 * for page-specific action buttons on the right. Replaces the emoji-in-h1
 * pattern across feature pages.
 */
export default function PageHeader({ icon: Icon, color, title, right }: PageHeaderProps) {
  // "22" appended to a #RRGGBB hex becomes #RRGGBB22 (13% opacity) — a soft
  // tint that works in both light and dark themes without needing a separate
  // background swatch.
  const tintBg = /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}22` : 'var(--surface-hover)';

  return (
    <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: tintBg,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            flexShrink: 0,
          }}
        >
          <Icon size={24} strokeWidth={2.1} />
        </div>
        <h1 style={{ marginBottom: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

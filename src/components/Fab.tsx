"use client";
import { Plus } from 'lucide-react';

interface FabProps {
  onClick: () => void;
  ariaLabel?: string;
}

/**
 * Floating action button pinned to the bottom-right, above the bottom nav +
 * iOS safe-area inset. Uses the accent color with a white Plus icon.
 *
 * Used on pages where the "primary add" action should always be one tap away
 * regardless of scroll position (Meals, Notes).
 */
export default function Fab({ onClick, ariaLabel }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || 'Add'}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 16px)',
        width: 56,
        height: 56,
        borderRadius: 999,
        background: 'var(--accent-color)',
        color: 'white',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        touchAction: 'manipulation',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.2)',
        zIndex: 40, // below modal (z=100), above page content
        transition: 'transform 0.1s ease',
      }}
    >
      <Plus size={26} strokeWidth={2.5} />
    </button>
  );
}

"use client";
import { useEffect } from 'react';
import Image from 'next/image';
import { X, ChefHat, ExternalLink } from 'lucide-react';
import { safeImageUrl, safeHttpUrl } from '@/lib/url';
import RecipeDisplay from '@/components/RecipeDisplay';
import type { RecipeItem } from './constants';

/**
 * Bottom-sheet viewer for the recipe assigned to a planned meal. Reuses the
 * shared <RecipeDisplay> so it matches the Recipes tab exactly, and the
 * global `.bottom-sheet-*` classes so it matches the add-meal modal.
 * View-only: the per-ingredient grocery affordance stays off.
 */
export default function MealRecipeViewer({
  recipe,
  slotLabel,
  dayLabel,
  note,
  onClose,
}: {
  recipe: RecipeItem;
  slotLabel: string;
  dayLabel: string;
  note?: string;
  onClose: () => void;
}) {
  // Close on Escape, mirroring native dialog behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const heroImage = safeImageUrl(recipe.body?.image);
  const sourceUrl = safeHttpUrl(recipe.body?.sourceUrl);

  return (
    <div
      className="bottom-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${recipe.title} recipe`}
    >
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        {/* Grab handle */}
        <div
          aria-hidden
          style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--hairline-strong)', margin: '-8px auto 16px' }}
        />

        {/* Header row: context + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--accent-color)' }}>
              {slotLabel} · {dayLabel}
            </span>
            <h2 style={{ marginBottom: 0, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{recipe.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recipe"
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 999, border: 'none',
              background: 'var(--surface-hover)', color: 'var(--text-secondary)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero: image when available, else a tinted icon chip on theme */}
        {heroImage ? (
          <div style={{ position: 'relative', width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
            <Image
              src={heroImage}
              alt={recipe.title}
              fill
              sizes="(max-width: 600px) 100vw, 600px"
              style={{ objectFit: 'cover' }}
              unoptimized
            />
          </div>
        ) : (
          <div
            aria-hidden
            style={{
              width: '100%', height: 96, borderRadius: 16, marginBottom: 16,
              background: 'var(--surface-hover)', color: 'var(--accent-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChefHat size={36} strokeWidth={2.1} />
          </div>
        )}

        {note && (
          <div
            style={{
              display: 'flex', gap: 8, padding: '10px 14px', marginBottom: 16,
              background: 'var(--surface-hover)', borderRadius: 12,
              fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
            }}
          >
            {note}
          </div>
        )}

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-color)', fontWeight: 600, marginBottom: 16 }}
          >
            View source <ExternalLink size={13} />
          </a>
        )}

        <RecipeDisplay recipe={recipe} />
      </div>
    </div>
  );
}

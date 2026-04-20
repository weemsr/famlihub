"use client";
import { Save } from 'lucide-react';

export type CreationMode = 'link' | 'manual';

export default function RecipeImporter({
  mode,
  onMode,
  url,
  setUrl,
  loading,
  error,
  onImport,
  manualTitle,
  setManualTitle,
  manualImage,
  setManualImage,
  manualIngredients,
  setManualIngredients,
  manualInstructions,
  setManualInstructions,
  onManualCreate,
}: {
  mode: CreationMode;
  onMode: (m: CreationMode) => void;
  url: string;
  setUrl: (v: string) => void;
  loading: boolean;
  error: string;
  onImport: () => void;
  manualTitle: string;
  setManualTitle: (v: string) => void;
  manualImage: string;
  setManualImage: (v: string) => void;
  manualIngredients: string;
  setManualIngredients: (v: string) => void;
  manualInstructions: string;
  setManualInstructions: (v: string) => void;
  onManualCreate: () => void;
}) {
  return (
    <>
      <div className="flex gap-2 mb-4">
        <button
          className={`btn ${mode === 'link' ? '' : 'btn-secondary'}`}
          style={{ flex: 1 }}
          onClick={() => onMode('link')}
        >
          Import Link
        </button>
        <button
          className={`btn ${mode === 'manual' ? '' : 'btn-secondary'}`}
          style={{ flex: 1 }}
          onClick={() => onMode('manual')}
        >
          Write Manual
        </button>
      </div>

      <div className="card">
        {mode === 'link' ? (
          <>
            <h3 className="mb-4">Import a Recipe</h3>
            <p className="text-sm mb-4">Paste a recipe link to extract only the ingredients and instructions. No ads, no fluff.</p>

            {error && <div style={{ color: 'var(--danger-color)', marginBottom: 12, fontSize: 14, fontWeight: '500' }}>{error}</div>}

            <div className="flex gap-2">
              <input
                type="text"
                inputMode="url"
                className="input"
                placeholder="https://tasty.co/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={loading}
              />
              <button
                className="btn btn-secondary"
                style={{ padding: '0 16px', width: 'auto', fontSize: '13px' }}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    setUrl(text);
                  } catch (err) { console.error('Clipboard error', err); }
                }}
                disabled={loading}
              >
                Paste 📋
              </button>
              <button className="btn" style={{ padding: '0 24px', width: 'auto' }} onClick={onImport} disabled={loading || !url}>
                {loading ? '...' : <Save size={20} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="mb-4">Create Your Own</h3>
            {error && <div style={{ color: 'var(--danger-color)', marginBottom: 12, fontSize: 14, fontWeight: '500' }}>{error}</div>}

            <input
              type="text"
              className="input mb-4"
              placeholder="Recipe Name..."
              style={{ fontWeight: 'bold' }}
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
            />

            <input
              type="text"
              inputMode="url"
              className="input mb-4"
              placeholder="Image URL (Optional)"
              value={manualImage}
              onChange={e => setManualImage(e.target.value)}
            />

            <textarea
              className="input mb-4"
              placeholder="Ingredients (One per line)"
              style={{ height: 120, resize: 'none' }}
              value={manualIngredients}
              onChange={e => setManualIngredients(e.target.value)}
            />

            <textarea
              className="input mb-4"
              placeholder="Instructions (One step per line)"
              style={{ height: 150, resize: 'none' }}
              value={manualInstructions}
              onChange={e => setManualInstructions(e.target.value)}
            />

            <button className="btn" onClick={onManualCreate} disabled={loading || !manualTitle}>
              {loading ? 'Saving...' : 'Save Recipe'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

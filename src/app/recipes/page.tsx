"use client";
import { useState, useEffect, useCallback } from 'react';
import { Search, NotebookText } from 'lucide-react';
import { fetchRecipeFromUrl } from '@/app/actions/recipe';
import { supabase } from '@/lib/supabase';
import { asStringArray, hadStoredContent, type RecipeBody } from '@/lib/types';
import { cleanRecipeLine } from '@/lib/html';
import { LIMITS, capLen } from '@/lib/limits';
import PageHeader from '@/components/PageHeader';
import { useUndoDelete } from '@/components/UndoSnackbar';
import RecipeImporter, { type CreationMode } from './_components/RecipeImporter';
import RecipeCard, { type RecipeItem } from './_components/RecipeCard';

// Module-level cache: persists across client-side navigation so returning to
// the Recipes tab renders the list instantly while we revalidate in the
// background, instead of refetching from scratch and flashing a blank screen.
// Keyed to the owning user id so a sign-out/sign-in as a different family
// member can never show the previous account's recipes.
let recipesCache: RecipeItem[] | null = null;
let recipesCacheUserId: string | null = null;

export default function RecipesPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recipes, setRecipes] = useState<RecipeItem[]>(() => recipesCache ?? []);
  const [listLoading, setListLoading] = useState(() => recipesCache === null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editIngredients, setEditIngredients] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editServings, setEditServings] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [creationMode, setCreationMode] = useState<CreationMode>('link');
  const [manualTitle, setManualTitle] = useState('');
  const [manualImage, setManualImage] = useState('');
  const [manualServings, setManualServings] = useState('');
  const [manualIngredients, setManualIngredients] = useState('');
  const [manualInstructions, setManualInstructions] = useState('');
  const { offerUndo, snackbar } = useUndoDelete();

  // Fetch is separated from state application so the mount effect applies
  // data in .then callbacks (react-hooks/set-state-in-effect compliant).
  const loadRecipes = useCallback(() => {
    supabase.auth.getUser().then(({ data: userData }) => {
      if (!userData.user) { setListLoading(false); return; }

      // Cache belongs to a different account (user switched without a page
      // reload): drop the seeded list immediately rather than showing the
      // previous user's recipes while the fetch is in flight.
      if (recipesCacheUserId && recipesCacheUserId !== userData.user.id) {
        recipesCache = null;
        setRecipes([]);
        setListLoading(true);
      }

      supabase.from('items')
        .select('*')
        .eq('type', 'recipe')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (data) {
            recipesCache = data as RecipeItem[];
            recipesCacheUserId = userData.user.id;
            setRecipes(data as RecipeItem[]);
          }
          setListLoading(false);
        });
    });
  }, []);

  useEffect(() => {
    loadRecipes();
    // Realtime: recipe edits/imports from another device refresh this list
    // (every other tab already had this; recipes was the gap).
    const channel = supabase.channel('realtime:recipes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: 'type=eq.recipe' }, () => {
        loadRecipes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadRecipes]);

  // Keep the module cache in sync after the first load so add/edit/delete are
  // reflected instantly when the user navigates back to this tab.
  useEffect(() => { if (!listLoading) recipesCache = recipes; }, [recipes, listLoading]);

  const handleImport = async () => {
    if (!url) return;
    setLoading(true);
    setError('');

    const res = await fetchRecipeFromUrl(url);
    if (!res.success) {
      setError(res.error || 'Failed to import recipe');
      setLoading(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user || !res.recipe) { setLoading(false); return; }

    const { data, error: dbError } = await supabase.from('items').insert({
      type: 'recipe',
      title: capLen(res.recipe.title, LIMITS.title),
      body: {
        ingredients: res.recipe.ingredients,
        instructions: res.recipe.instructions,
        image: res.recipe.image,
        sourceUrl: res.recipe.sourceUrl,
        ...(res.recipe.servings ? { servings: res.recipe.servings } : {}),
      },
      user_id: userData.user.id,
    }).select().single();

    if (dbError) setError(dbError.message);
    else if (data) {
      setUrl('');
      setRecipes([data, ...recipes]);
      setExpandedId(data.id);
    }
    setLoading(false);
  };

  const handleManualCreate = async () => {
    if (!manualTitle.trim()) return;
    setLoading(true);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setLoading(false); return; }

    const ings = manualIngredients.split('\n').filter(i => i.trim() !== '').map(l => capLen(l, LIMITS.line));
    const insts = manualInstructions.split('\n').filter(i => i.trim() !== '').map(l => capLen(l, LIMITS.line));
    const parsedServings = parseInt(manualServings, 10);
    const servings = Number.isFinite(parsedServings) && parsedServings > 0 ? parsedServings : undefined;

    const { data, error: dbError } = await supabase.from('items').insert({
      type: 'recipe',
      title: capLen(manualTitle.trim(), LIMITS.title),
      body: {
        ingredients: ings,
        instructions: insts,
        image: manualImage.trim(),
        sourceUrl: '',
        ...(servings ? { servings } : {}),
      },
      user_id: userData.user.id,
    }).select().single();

    if (dbError) {
      setError(dbError.message);
    } else if (data) {
      setRecipes([data, ...recipes]);
      setExpandedId(data.id);
      setManualTitle('');
      setManualImage('');
      setManualServings('');
      setManualIngredients('');
      setManualInstructions('');
      setCreationMode('link');
    }
    setLoading(false);
  };

  const deleteRecipe = async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    const prevRecipes = recipes;
    setRecipes(recipes.filter(r => r.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) { setRecipes(prevRecipes); return; }
    offerUndo(recipe.title, recipe as unknown as Record<string, unknown>, () => {
      setRecipes(prev => (prev.some(r => r.id === recipe.id) ? prev : [recipe, ...prev]));
    });
  };

  const startEdit = (recipe: RecipeItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(recipe.id);
    setEditError(null);
    setEditTitle(recipe.title);

    const cleanIngs = asStringArray(recipe.body?.ingredients).map(cleanRecipeLine);
    const cleanInsts = asStringArray(recipe.body?.instructions).map(cleanRecipeLine);

    setEditIngredients(cleanIngs.join('\n'));
    setEditInstructions(cleanInsts.join('\n'));
    setEditServings(recipe.body?.servings ? String(recipe.body.servings) : '');
    setExpandedId(recipe.id);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditError(null);
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId) return;

    const newIngredients = editIngredients.split('\n').filter(i => i.trim() !== '').map(l => capLen(l, LIMITS.line));
    const newInstructions = editInstructions.split('\n').filter(i => i.trim() !== '').map(l => capLen(l, LIMITS.line));
    const parsedServings = parseInt(editServings, 10);
    const servings = Number.isFinite(parsedServings) && parsedServings > 0 ? parsedServings : undefined;

    const recipeToUpdate = recipes.find(r => r.id === editingId);
    if (!recipeToUpdate) return;

    // Refuse to blank out a recipe that still has content stored. An editor
    // that opened empty means we couldn't read the stored shape, not that the
    // user cleared it — saving that through would destroy the only copy.
    const wouldWipeIngredients =
      newIngredients.length === 0 && hadStoredContent(recipeToUpdate.body?.ingredients);
    const wouldWipeInstructions =
      newInstructions.length === 0 && hadStoredContent(recipeToUpdate.body?.instructions);
    if (wouldWipeIngredients || wouldWipeInstructions) {
      setEditError(
        `This would erase the saved ${wouldWipeIngredients ? 'ingredients' : 'instructions'}, ` +
        'so nothing was changed. Clear the box on purpose? Delete the recipe instead.'
      );
      return;
    }

    const newTitle = capLen(editTitle.trim(), LIMITS.title);
    if (!newTitle) {
      setEditError('Give this recipe a name.');
      return;
    }

    const updatedBody: RecipeBody = {
      ...recipeToUpdate.body,
      ingredients: newIngredients,
      instructions: newInstructions,
      servings,
    };

    const prevRecipes = recipes;
    setRecipes(recipes.map(r => r.id === editingId ? { ...r, title: newTitle, body: updatedBody } : r));
    setEditingId(null);
    setEditError(null);

    const { error } = await supabase.from('items').update({ title: newTitle, body: updatedBody }).eq('id', editingId);
    if (error) {
      setRecipes(prevRecipes);
      setEditError(error.message);
    }
  };

  const filtered = recipes.filter(r => (r.title || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader icon={NotebookText} color="#B87333" title="Recipes" />
      {snackbar}

      <RecipeImporter
        mode={creationMode}
        onMode={setCreationMode}
        url={url}
        setUrl={setUrl}
        loading={loading}
        error={error}
        onImport={handleImport}
        manualTitle={manualTitle}
        setManualTitle={setManualTitle}
        manualImage={manualImage}
        setManualImage={setManualImage}
        manualServings={manualServings}
        setManualServings={setManualServings}
        manualIngredients={manualIngredients}
        setManualIngredients={setManualIngredients}
        manualInstructions={manualInstructions}
        setManualInstructions={setManualInstructions}
        onManualCreate={handleManualCreate}
      />

      <div className="flex gap-2 mb-4">
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={18} style={{ position: 'absolute', left: 16, top: 14, color: 'var(--text-secondary)' }} />
          <input
            type="text"
            className="input"
            placeholder="Search your cookbook..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 44 }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {listLoading && recipes.length === 0 && (
          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ padding: '20px', borderBottom: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="skeleton" style={{ height: 16, width: '55%' }} />
                <div className="skeleton" style={{ height: 12, width: '32%' }} />
              </div>
            ))}
          </div>
        )}

        {!(listLoading && recipes.length === 0) && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>No recipes found.</div>
        )}

        {filtered.map(recipe => {
          const isExpanded = expandedId === recipe.id;
          const isEditing = editingId === recipe.id;
          return (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isExpanded={isExpanded}
              onToggleExpand={() => setExpandedId(isExpanded ? null : recipe.id)}
              isEditing={isEditing}
              editTitle={editTitle}
              editIngredients={editIngredients}
              editInstructions={editInstructions}
              editServings={editServings}
              editError={isEditing ? editError : null}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onChangeEditTitle={setEditTitle}
              onChangeEditIngredients={setEditIngredients}
              onChangeEditInstructions={setEditInstructions}
              onChangeEditServings={setEditServings}
              onDelete={deleteRecipe}
            />
          );
        })}
      </div>
    </div>
  );
}

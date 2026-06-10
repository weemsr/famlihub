"use client";
import { useState, useEffect } from 'react';
import { Search, NotebookText } from 'lucide-react';
import { fetchRecipeFromUrl } from '@/app/actions/recipe';
import { supabase } from '@/lib/supabase';
import { asStringArray, type RecipeBody } from '@/lib/types';
import { LIMITS, capLen } from '@/lib/limits';
import PageHeader from '@/components/PageHeader';
import RecipeImporter, { type CreationMode } from './_components/RecipeImporter';
import RecipeCard, { type RecipeItem } from './_components/RecipeCard';

export default function RecipesPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editIngredients, setEditIngredients] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editServings, setEditServings] = useState('');

  const [creationMode, setCreationMode] = useState<CreationMode>('link');
  const [manualTitle, setManualTitle] = useState('');
  const [manualImage, setManualImage] = useState('');
  const [manualServings, setManualServings] = useState('');
  const [manualIngredients, setManualIngredients] = useState('');
  const [manualInstructions, setManualInstructions] = useState('');

  const loadRecipes = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase.from('items')
      .select('*')
      .eq('type', 'recipe')
      .order('created_at', { ascending: false });

    if (data) setRecipes(data);
  };

  useEffect(() => { loadRecipes(); }, []);

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
      title: res.recipe.title,
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
    const prevRecipes = recipes;
    setRecipes(recipes.filter(r => r.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setRecipes(prevRecipes);
  };

  const startEdit = (recipe: RecipeItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(recipe.id);
    setEditTitle(recipe.title);

    const rawIngs = asStringArray(recipe.body?.ingredients);
    const rawInsts = asStringArray(recipe.body?.instructions);
    const cleanIngs = rawIngs.map(i => i.replace(/<[^>]*>?/gm, ''));
    const cleanInsts = rawInsts.map(i => i.replace(/<[^>]*>?/gm, ''));

    setEditIngredients(cleanIngs.join('\n'));
    setEditInstructions(cleanInsts.join('\n'));
    setEditServings(recipe.body?.servings ? String(recipe.body.servings) : '');
    setExpandedId(recipe.id);
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

    const newTitle = capLen(editTitle, LIMITS.title);
    const updatedBody: RecipeBody = {
      ...recipeToUpdate.body,
      ingredients: newIngredients,
      instructions: newInstructions,
      servings,
    };

    const prevRecipes = recipes;
    setRecipes(recipes.map(r => r.id === editingId ? { ...r, title: newTitle, body: updatedBody } : r));
    setEditingId(null);

    const { error } = await supabase.from('items').update({ title: newTitle, body: updatedBody }).eq('id', editingId);
    if (error) setRecipes(prevRecipes);
  };

  const filtered = recipes.filter(r => (r.title || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader icon={NotebookText} color="#B87333" title="Recipes" />

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
        {filtered.length === 0 && (
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
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
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

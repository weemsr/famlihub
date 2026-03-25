"use client";
import { useState, useEffect } from 'react';
import { Search, Save, ChevronDown, ChevronUp, Trash2, Edit2 } from 'lucide-react';
import { fetchRecipeFromUrl } from '@/app/actions/recipe';
import { supabase } from '@/lib/supabase';

interface RecipeItem {
  id: string;
  title: string;
  body: {
    ingredients: string[];
    instructions: string[];
    image: string;
    sourceUrl: string;
  };
}

const IngredientRow = ({ ing }: { ing: string }) => {
  const [showOptions, setShowOptions] = useState(false);
  const [addingState, setAddingState] = useState<'idle' | 'adding' | 'success'>('idle');

  const addToGrocery = async (store: 'regular' | 'costco' | 'asian') => {
    setAddingState('adding');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setAddingState('idle'); return; }

    const cleanText = ing.replace(/<[^>]*>?/gm, '');

    const { error } = await supabase.from('items').insert({
      type: 'grocery',
      title: cleanText,
      body: { store },
      user_id: userData.user.id
    });

    if (error) { setAddingState('idle'); return; }

    setAddingState('success');
    setShowOptions(false);

    setTimeout(() => setAddingState('idle'), 2000);
  };

  return (
    <li style={{marginBottom: 12, display: 'flex', flexDirection: 'column'}}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ flex: 1, paddingTop: 2 }}>{ing.replace(/<[^>]*>?/gm, '')}</span>
        
        {addingState === 'success' ? (
           <span style={{ color: 'var(--accent-color)', fontSize: 13, fontWeight: 'bold', minWidth: 50, textAlign: 'right' }}>Added! ✓</span>
        ) : (
          <button 
            className="btn" 
            style={{ padding: '4px 12px', fontSize: 12, width: 'auto', minWidth: 60, background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)' }}
            onClick={() => setShowOptions(!showOptions)}
          >
            + Add
          </button>
        )}
      </div>
      
      {showOptions && addingState !== 'success' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12, width: 'auto', background: 'var(--accent-color)', color: 'white' }} onClick={() => addToGrocery('regular')}>Reg</button>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12, width: 'auto', background: 'var(--accent-color)', color: 'white' }} onClick={() => addToGrocery('costco')}>Costco</button>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12, width: 'auto', background: 'var(--accent-color)', color: 'white' }} onClick={() => addToGrocery('asian')}>Asian</button>
        </div>
      )}
    </li>
  );
};

export default function RecipesPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editIngredients, setEditIngredients] = useState('');
  const [editInstructions, setEditInstructions] = useState('');

  // Manual Creation State
  const [creationMode, setCreationMode] = useState<'link' | 'manual'>('link');
  const [manualTitle, setManualTitle] = useState('');
  const [manualImage, setManualImage] = useState('');
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
      setLoading(false); return;
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
        sourceUrl: res.recipe.sourceUrl
      },
      user_id: userData.user.id
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

    const ings = manualIngredients.split('\n').filter(i => i.trim() !== '');
    const insts = manualInstructions.split('\n').filter(i => i.trim() !== '');

    const { data, error: dbError } = await supabase.from('items').insert({
      type: 'recipe',
      title: manualTitle.trim(),
      body: {
        ingredients: ings,
        instructions: insts,
        image: manualImage.trim(),
        sourceUrl: ''
      },
      user_id: userData.user.id
    }).select().single();

    if (dbError) {
      setError(dbError.message);
    } else if (data) {
      setRecipes([data, ...recipes]);
      setExpandedId(data.id);
      setManualTitle('');
      setManualImage('');
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
    
    // Strip HTML manually from scraper artifacts before handing to raw textarea
    const rawIngs = Array.isArray(recipe.body.ingredients) ? recipe.body.ingredients : (typeof recipe.body.ingredients === 'string' ? [recipe.body.ingredients] : []);
    const rawInsts = Array.isArray(recipe.body.instructions) ? recipe.body.instructions : (typeof recipe.body.instructions === 'string' ? [recipe.body.instructions] : []);
    
    const cleanIngs = rawIngs.map(i => typeof i === 'string' ? i.replace(/<[^>]*>?/gm, '') : '');
    const cleanInsts = rawInsts.map(i => typeof i === 'string' ? i.replace(/<[^>]*>?/gm, '') : '');
    
    setEditIngredients(cleanIngs.join('\n'));
    setEditInstructions(cleanInsts.join('\n'));
    setExpandedId(recipe.id);
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId) return;
    
    const newIngredients = editIngredients.split('\n').filter(i => i.trim() !== '');
    const newInstructions = editInstructions.split('\n').filter(i => i.trim() !== '');
    
    const recipeToUpdate = recipes.find(r => r.id === editingId);
    if (!recipeToUpdate) return;

    const updatedBody = {
      ...recipeToUpdate.body,
      ingredients: newIngredients,
      instructions: newInstructions
    };

    const prevRecipes = recipes;
    setRecipes(recipes.map(r => r.id === editingId ? { ...r, title: editTitle, body: updatedBody } : r));
    setEditingId(null);

    const { error } = await supabase.from('items').update({ title: editTitle, body: updatedBody }).eq('id', editingId);
    if (error) setRecipes(prevRecipes);
  };

  const filtered = recipes.filter(r => (r.title || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1>Recipes 🍳</h1>

      <div className="flex gap-2 mb-4">
        <button 
          className={`btn ${creationMode === 'link' ? '' : 'btn-secondary'}`} 
          style={{ flex: 1 }}
          onClick={() => setCreationMode('link')}
        >
          Import Link
        </button>
        <button 
          className={`btn ${creationMode === 'manual' ? '' : 'btn-secondary'}`} 
          style={{ flex: 1 }}
          onClick={() => setCreationMode('manual')}
        >
          Write Manual
        </button>
      </div>
      
      <div className="card">
        {creationMode === 'link' ? (
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
                onChange={(e) => setUrl(e.target.value)}
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
              <button className="btn" style={{ padding: '0 24px', width: 'auto' }} onClick={handleImport} disabled={loading || !url}>
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
            
            <button className="btn" onClick={handleManualCreate} disabled={loading || (!manualTitle)}>
              {loading ? 'Saving...' : 'Save Recipe'}
            </button>
          </>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={18} style={{ position: 'absolute', left: 16, top: 14, color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            className="input" 
            placeholder="Search your cookbook..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 44 }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>No recipes found.</div>}
        
        {filtered.map(recipe => {
          const body = recipe.body || {} as any;
          const isExpanded = expandedId === recipe.id;
          const isEditing = editingId === recipe.id;
          
          return (
            <div key={recipe.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <div 
                style={{ padding: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => !isEditing && setExpandedId(isExpanded ? null : recipe.id)}
              >
                <div style={{ flex: 1, paddingRight: 16 }}>
                  {isEditing ? (
                    <input 
                      type="text" 
                      className="input" 
                      onClick={e => e.stopPropagation()}
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      style={{ fontWeight: 700, fontSize: '1.1rem', padding: '8px 16px' }}
                    />
                  ) : (
                    <>
                      <h3 style={{ marginBottom: 4 }}>{recipe.title}</h3>
                      {body.sourceUrl && (
                        <a href={body.sourceUrl} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--accent-color)', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                          Original Link
                        </a>
                      )}
                    </>
                  )}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isEditing ? (
                    <button className="btn" style={{ padding: '6px 16px', width: 'auto', background: 'var(--success-color)' }} onClick={saveEdit}>Save</button>
                  ) : (
                    <>
                      <button 
                        className="btn" 
                        style={{ padding: '4px 8px', background: 'transparent', color: 'var(--text-secondary)', width: 'auto' }}
                        onClick={(e) => startEdit(recipe, e)}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        className="btn" 
                        style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto' }}
                        onClick={(e) => { e.stopPropagation(); deleteRecipe(recipe.id); }}
                      >
                        <Trash2 size={20} />
                      </button>
                      {isExpanded ? <ChevronUp size={20} className="text-secondary" /> : <ChevronDown size={20} className="text-secondary" />}
                    </>
                  )}
                </div>
              </div>
              
              {isExpanded && (
                <div style={{ padding: '0 20px 24px 20px' }}>
                  {body.image && !isEditing && <img src={body.image} alt={recipe.title} style={{ width: '100%', borderRadius: 16, marginBottom: 20, maxHeight: 250, objectFit: 'cover' }} />}
                  
                  <h3 style={{ marginTop: 8, marginBottom: 12 }}>Ingredients</h3>
                  {isEditing ? (
                    <textarea 
                      className="input mb-4" 
                      style={{ height: 200, resize: 'none' }}
                      value={editIngredients}
                      onChange={e => setEditIngredients(e.target.value)}
                      placeholder="One ingredient per line"
                    />
                  ) : (
                    <ul style={{ paddingLeft: 0, listStyle: 'none', marginBottom: 24, color: 'var(--text-primary)' }}>
                      {(Array.isArray(body.ingredients) ? body.ingredients : (typeof body.ingredients === 'string' ? [body.ingredients] : [])).map((ing: any, i: number) => <IngredientRow key={i} ing={String(ing)} />)}
                    </ul>
                  )}
                  
                  <h3 style={{ marginBottom: 12 }}>Instructions</h3>
                  {isEditing ? (
                    <textarea 
                      className="input mb-4" 
                      style={{ height: 250, resize: 'none' }}
                      value={editInstructions}
                      onChange={e => setEditInstructions(e.target.value)}
                      placeholder="One step per line"
                    />
                  ) : (
                    <ol style={{ paddingLeft: 24, color: 'var(--text-primary)' }}>
                      {(Array.isArray(body.instructions) ? body.instructions : (typeof body.instructions === 'string' ? [body.instructions] : [])).map((inst: any, i: number) => <li key={i} style={{marginBottom: 12}}>{String(inst).replace(/<[^>]*>?/gm, '')}</li>)}
                    </ol>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { NextResponse } from 'next/server';
import { verifyCalendarToken } from '@/lib/calendar-token';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mealsToIcs } from '@/lib/ics';

// Force dynamic execution (no static caching).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Node 18+ includes URL handling; we also use node:crypto in calendar-token.
interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  const { token: rawToken } = await context.params;

  // The subscribed URL ends in `.ics`; strip the suffix if present so both
  // `.../<token>` and `.../<token>.ics` work.
  const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;

  const userId = verifyCalendarToken(token);
  if (!userId) {
    return new NextResponse('Invalid or expired calendar token.', { status: 401 });
  }

  let meals: Array<{ id: string; title?: string; body: { day: string; mealId: string; recipeId?: string; customName?: string; note?: string }; created_at?: string }> = [];
  let recipes: Array<{ id: string; title: string }> = [];

  try {
    const admin = getSupabaseAdmin();

    const [mealsRes, recipesRes] = await Promise.all([
      admin
        .from('items')
        .select('id,title,body,created_at')
        .eq('user_id', userId)
        .eq('type', 'meal'),
      admin
        .from('items')
        .select('id,title')
        .eq('user_id', userId)
        .eq('type', 'recipe'),
    ]);

    if (mealsRes.error) throw mealsRes.error;
    if (recipesRes.error) throw recipesRes.error;

    meals = (mealsRes.data || []) as typeof meals;
    recipes = (recipesRes.data || []) as typeof recipes;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load calendar data.';
    return new NextResponse(`Calendar feed error: ${message}`, { status: 500 });
  }

  const ics = mealsToIcs(meals, recipes);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // Google's subscribed-URL refresh is a black box; don't cache longer
      // than necessary so user edits show up sooner if Google does re-fetch.
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline; filename="famlihub.ics"',
    },
  });
}

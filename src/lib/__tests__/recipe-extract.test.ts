import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { harvestIngredientLists, looksLikeIngredient } from '../recipe-extract';

const run = (html: string) => harvestIngredientLists(cheerio.load(html));

describe('looksLikeIngredient', () => {
  it('accepts quantity-led and unit-bearing lines', () => {
    expect(looksLikeIngredient('2 cups cherry tomatoes')).toBe(true);
    expect(looksLikeIngredient('½ tsp salt')).toBe(true);
    expect(looksLikeIngredient('Grated Parmesan cheese, to serve')).toBe(false);
    expect(looksLikeIngredient('A pinch of saffron')).toBe(true);
  });

  it('rejects navigation labels and prose', () => {
    expect(looksLikeIngredient('Home')).toBe(false);
    expect(looksLikeIngredient('Make sure your skillet is hot enough.')).toBe(false);
  });
});

describe('harvestIngredientLists', () => {
  it('merges sibling section lists, including single-item ones', () => {
    // Regression: foodiefiber splits ingredients into "For The Pasta" (1 item),
    // "For The Shrimp" (1 item) and "For The Sauce" (many). The old rule took
    // the first list with >2 items, so the shrimp and pasta vanished.
    const html = `<article>
      <h3>Ingredients You'll Need:</h3>
      <h4>For The Pasta:</h4><ul><li>8 oz spaghetti or linguine pasta</li></ul>
      <h4>For The Shrimp:</h4><ul><li>1 lb large shrimp, peeled and deveined</li></ul>
      <h4>For The Sauce:</h4><ul>
        <li>2 cups cherry tomatoes</li><li>4 cloves garlic, minced</li><li>2 tbsp olive oil</li>
      </ul>
    </article>`;
    const got = run(html);
    expect(got).toContain('1 lb large shrimp, peeled and deveined');
    expect(got).toContain('8 oz spaghetti or linguine pasta');
    expect(got).toContain('For The Pasta:');
    expect(got.filter(l => !l.endsWith(':'))).toHaveLength(5);
  });

  it('ignores nav menus and prose tip lists', () => {
    const html = `<div>
      <nav><ul><li>Home</li><li>Recipe Index</li><li>About</li><li>Contact</li></ul></nav>
      <div><ul>
        <li>Make sure your skillet is hot enough so the shrimp sear nicely.</li>
        <li>Season the shrimp before cooking to elevate the flavor.</li>
        <li>Always remove them from the skillet when they are done.</li>
      </ul></div>
      <section><ul><li>2 cups flour</li><li>1 tsp salt</li><li>3 tbsp butter</li></ul></section>
    </div>`;
    expect(run(html)).toEqual(['2 cups flour', '1 tsp salt', '3 tbsp butter']);
  });

  it('omits section labels when there is only one list', () => {
    const html = `<div><h4>Ingredients</h4><ul>
      <li>2 cups flour</li><li>1 tsp salt</li><li>3 tbsp butter</li>
    </ul></div>`;
    expect(run(html)).toEqual(['2 cups flour', '1 tsp salt', '3 tbsp butter']);
  });

  it('picks the richest group when a page holds several recipes', () => {
    const html = `<div>
      <section><ul><li>1 cup sugar</li><li>2 eggs</li><li>1 tsp vanilla</li></ul></section>
      <aside><ul><li>4 cups flour</li><li>2 tbsp yeast</li><li>1 tsp salt</li><li>3 cups water</li></ul></aside>
    </div>`;
    expect(run(html)).toHaveLength(4);
  });

  it('still refuses an incidental short list', () => {
    expect(run('<div><ul><li>2 cups flour</li><li>1 tsp salt</li></ul></div>')).toEqual([]);
  });

  it('returns nothing when the page has no ingredient-shaped lists', () => {
    expect(run('<div><ul><li>Home</li><li>About</li><li>Contact</li></ul></div>')).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { formatQuantity, scaleIngredient, parseRecipeYield } from '../recipe-scale';

describe('formatQuantity', () => {
  it('renders whole numbers plainly', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(12)).toBe('12');
  });
  it('renders common fractions as unicode', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(1.5)).toBe('1 ½');
    expect(formatQuantity(2.75)).toBe('2 ¾');
  });
  it('falls back to trimmed decimals for non-eighths', () => {
    expect(formatQuantity(1.33)).toBe('1.33');
    expect(formatQuantity(0.3)).toBe('0.3');
  });
  it('handles zero/invalid input', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(-1)).toBe('0');
    expect(formatQuantity(NaN)).toBe('0');
  });
});

describe('scaleIngredient', () => {
  it('scales a plain integer quantity', () => {
    expect(scaleIngredient('2 cups flour', 2)).toBe('4 cups flour');
  });
  it('scales decimals', () => {
    expect(scaleIngredient('1.5 tsp salt', 2)).toBe('3 tsp salt');
  });
  it('scales ascii fractions', () => {
    expect(scaleIngredient('1/2 cup sugar', 2)).toBe('1 cup sugar');
  });
  it('scales mixed numbers ("1 1/2")', () => {
    expect(scaleIngredient('1 1/2 cups milk', 2)).toBe('3 cups milk');
  });
  it('scales unicode fractions', () => {
    expect(scaleIngredient('½ cup butter', 2)).toBe('1 cup butter');
    expect(scaleIngredient('1 ½ tbsp oil', 2)).toBe('3 tbsp oil');
  });
  it('scales ranges', () => {
    expect(scaleIngredient('1-2 cups broth', 2)).toBe('2-4 cups broth');
    expect(scaleIngredient('1 to 2 tsp chili', 2)).toBe('2 to 4 tsp chili');
  });
  it('passes through lines with no leading quantity', () => {
    expect(scaleIngredient('Salt to taste', 2)).toBe('Salt to taste');
    expect(scaleIngredient('Marinade Ingredients:', 2)).toBe('Marinade Ingredients:');
  });
  it('is a no-op at factor 1 or invalid factors', () => {
    expect(scaleIngredient('2 cups flour', 1)).toBe('2 cups flour');
    expect(scaleIngredient('2 cups flour', 0)).toBe('2 cups flour');
    expect(scaleIngredient('2 cups flour', NaN)).toBe('2 cups flour');
  });
});

describe('parseRecipeYield', () => {
  it('handles numbers, numeric strings, and phrases', () => {
    expect(parseRecipeYield(4)).toBe(4);
    expect(parseRecipeYield('4')).toBe(4);
    expect(parseRecipeYield('4 servings')).toBe(4);
    expect(parseRecipeYield('Serves 6')).toBe(6);
  });
  it('takes the first usable entry from arrays', () => {
    expect(parseRecipeYield(['8', '8 servings'])).toBe(8);
  });
  it('returns undefined for junk', () => {
    expect(parseRecipeYield(undefined)).toBeUndefined();
    expect(parseRecipeYield('a lot')).toBeUndefined();
    expect(parseRecipeYield(0)).toBeUndefined();
  });
});

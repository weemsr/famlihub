import { fetchRecipeFromUrl } from './src/app/actions/recipe';

async function test() {
  console.log('Testing Food Network...');
  const fn = await fetchRecipeFromUrl('https://www.foodnetwork.com/recipes/food-network-kitchen/the-best-chicken-noodle-soup-7194859');
  console.log('FN Result:', fn?.success, 'Title:', fn?.recipe?.title, 'Ingredients:', fn?.recipe?.ingredients?.length, 'Instructions:', fn?.recipe?.instructions?.length);
  
  console.log('\nTesting Made With Lau...');
  const ml = await fetchRecipeFromUrl('https://www.madewithlau.com/recipes/cantonese-scrambled-eggs');
  console.log('ML Result:', ml?.success, 'Title:', ml?.recipe?.title, 'Ingredients:', ml?.recipe?.ingredients?.length, 'Instructions:', ml?.recipe?.instructions?.length);
  
  if (ml?.recipe?.ingredients) {
      console.log('Sample ML Ingredient:', ml.recipe.ingredients[0]);
  }
}

test();

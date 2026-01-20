// Script to populate pokemon_master table with all Pokemon from PokeAPI
// Run this with: node populate_pokemon.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// PokeAPI sprite URLs
const getGifUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;
const getSpriteUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

async function fetchPokemonName(id) {
  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.name.charAt(0).toUpperCase() + data.name.slice(1); // Capitalize first letter
  } catch (error) {
    console.error(`Error fetching Pokemon ${id}:`, error.message);
    return null;
  }
}

async function populatePokemon(startId = 1, endId = 1025, batchSize = 50) {
  console.log(`Populating Pokemon ${startId} to ${endId}...`);
  
  for (let i = startId; i <= endId; i += batchSize) {
    const batch = [];
    const endBatch = Math.min(i + batchSize - 1, endId);
    
    console.log(`Fetching batch ${i}-${endBatch}...`);
    
    // Fetch names for this batch
    for (let id = i; id <= endBatch; id++) {
      const name = await fetchPokemonName(id);
      if (name) {
        batch.push({
          national_dex_id: id,
          name: name,
          gif_url: getGifUrl(id),
          sprite_url: getSpriteUrl(id)
        });
      }
      
      // Rate limiting - PokeAPI allows ~100 requests per minute
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Insert batch into Supabase
    if (batch.length > 0) {
      const { data, error } = await supabase
        .from('pokemon_master')
        .upsert(batch, { onConflict: 'national_dex_id' });
      
      if (error) {
        console.error('Error inserting batch:', error);
      } else {
        console.log(`✓ Inserted ${batch.length} Pokemon (${i}-${endBatch})`);
      }
    }
  }
  
  console.log('✓ All Pokemon populated!');
}

async function populateGen1Only() {
  console.log('Populating Gen 1 Pokemon (1-151)...');
  await populatePokemon(1, 151, 25);
}

async function populatePopular() {
  // Curated list of popular Pokemon for quick testing
  const popularIds = [
    1, 4, 7, 25, 39, 52, 54, 59, 68, 94, 130, 131, 132, 133, 137, 143, 144, 145, 146, 149, 150, 151,
    172, 175, 196, 197, 246, 249, 250, 282, 383, 384, 448, 643, 644, 646, 658, 700, 716, 717, 718, 802, 803, 806
  ];
  
  console.log(`Populating ${popularIds.length} popular Pokemon...`);
  
  const batch = [];
  for (const id of popularIds) {
    const name = await fetchPokemonName(id);
    if (name) {
      batch.push({
        national_dex_id: id,
        name: name,
        gif_url: getGifUrl(id),
        sprite_url: getSpriteUrl(id)
      });
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const { data, error } = await supabase
    .from('pokemon_master')
    .upsert(batch, { onConflict: 'national_dex_id' });
  
  if (error) {
    console.error('Error inserting popular Pokemon:', error);
  } else {
    console.log(`✓ Inserted ${batch.length} popular Pokemon`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'gen1';

async function main() {
  console.log('Pokemon Master Table Populator');
  console.log('==============================\n');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file');
    process.exit(1);
  }
  
  switch (command) {
    case 'gen1':
      await populateGen1Only();
      break;
    case 'popular':
      await populatePopular();
      break;
    case 'all':
      await populatePokemon(1, 1025, 50);
      break;
    case 'custom':
      const start = parseInt(args[1]) || 1;
      const end = parseInt(args[2]) || 151;
      await populatePokemon(start, end, 50);
      break;
    default:
      console.log('Usage: node populate_pokemon.js [command] [options]\n');
      console.log('Commands:');
      console.log('  gen1           - Populate Gen 1 Pokemon (1-151) [default]');
      console.log('  popular        - Populate ~50 popular Pokemon');
      console.log('  all            - Populate all Pokemon (1-1025+)');
      console.log('  custom <start> <end> - Populate custom range\n');
      console.log('Examples:');
      console.log('  node populate_pokemon.js gen1');
      console.log('  node populate_pokemon.js popular');
      console.log('  node populate_pokemon.js all');
      console.log('  node populate_pokemon.js custom 1 500');
      process.exit(0);
  }
}

main();

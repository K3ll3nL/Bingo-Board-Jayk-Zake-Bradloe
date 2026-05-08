const R2_BUCKET_URL = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev';

/**
 * Returns the gender code(s) for a pokemon following this priority:
 *   1. genderless                                          → ['uk']
 *   2. custom_gender_code === 'mo' + has_gender_difference → ['mo', 'fo']  (mo=form0, fo=form1)
 *   3. custom_gender_code set                              → [custom_gender_code]
 *   4. has_gender_difference                               → ['md']
 *   5. has_major_gender_difference                         → ['mo', 'fo']
 *   6. default                                             → ['mf']
 */
const resolveGenderCodes = (pokemon) => {
  if (pokemon?.genderless) return ['uk'];
  if (pokemon?.custom_gender_code === 'mo' && pokemon?.has_gender_difference) return ['mo', 'fo'];
  if (pokemon?.custom_gender_code) return [pokemon.custom_gender_code];
  if (pokemon?.has_gender_difference) return ['md'];
  if (pokemon?.has_major_gender_difference) return ['mo', 'fo'];
  return ['mf'];
};

/**
 * Returns the form index to use in the URL for a given pokemon row.
 * Uses form_id when non-zero (i.e. the row IS a specific alternate form),
 * otherwise falls back to 0 (base form).
 */
export const resolveFormIndex = (pokemon) => {
  const id = pokemon?.form_id;
  return id ? id : 0;
};

/** True for any pokemon whose mo/fo forms are stored at form 0 / form 1. */
const isMoFoPair = (pokemon) =>
  !!(pokemon?.has_major_gender_difference ||
    (pokemon?.custom_gender_code === 'mo' && pokemon?.has_gender_difference));

/**
 * Returns the form index for a specific gender code.
 * For mo/fo pair pokemon, male (mo) is always form 0 and female (fo) is always form 1.
 */
export const resolveFormIndexForGender = (pokemon, genderCode) => {
  if (isMoFoPair(pokemon)) {
    return genderCode === 'fo' ? 1 : 0;
  }
  return resolveFormIndex(pokemon);
};

/**
 * Returns all R2 image URLs for a pokemon.
 * - If form_id is non-zero, uses only that form index.
 * - Otherwise loops 0 … forms_count-1.
 * - Multiplied by all gender codes (usually 1; two for has_major_gender_difference).
 * @param {Object} pokemon - pokemon_master row
 * @returns {string[]}
 */
export const getPokemonImageUrls = (pokemon) => {
  if (!pokemon?.national_dex_id) return [];

  const dexId = String(pokemon.national_dex_id).padStart(4, '0');
  const genderCodes = resolveGenderCodes(pokemon);

  const formIndices = pokemon?.form_id
    ? [pokemon.form_id]
    : Array.from({ length: pokemon?.forms_count || 1 }, (_, i) => i);

  const urls = [];
  for (const fi of formIndices) {
    for (const genderCode of genderCodes) {
      const effectiveFi = isMoFoPair(pokemon)
        ? resolveFormIndexForGender(pokemon, genderCode)
        : fi;
      const form = String(effectiveFi).padStart(3, '0');
      urls.push(`${R2_BUCKET_URL}/poke_capture_${dexId}_${form}_${genderCode}_n_00000000_f_r.png`);
    }
  }
  return urls;
};

/**
 * Build a single R2 image URL.
 * formIndex defaults to resolveFormIndex(pokemon) so form_id is respected automatically.
 * @param {Object} pokemon - pokemon_master row
 * @param {number} [formIndex] - explicit override; defaults to form_id ?? 0
 * @param {string} [genderCode] - explicit override; defaults to resolveGenderCodes()[0]
 * @returns {string} URL or '' if national_dex_id is missing
 */
export const buildPokemonImageUrl = (pokemon, formIndex, genderCode) => {
  if (!pokemon?.national_dex_id) return '';

  const code = genderCode || resolveGenderCodes(pokemon)[0];
  const fi = formIndex ?? resolveFormIndexForGender(pokemon, code);
  const dexId = String(pokemon.national_dex_id).padStart(4, '0');
  const form = String(fi).padStart(3, '0');

  return `${R2_BUCKET_URL}/poke_capture_${dexId}_${form}_${code}_n_00000000_f_r.png`;
};

/** Get available gender codes for this pokemon (drives the gender toggle in PokemonImage). */
export const getAvailableGenderCodes = (pokemon) => resolveGenderCodes(pokemon);

/** Whether the PokemonImage gender toggle should be shown (only when multiple gender codes exist). */
export const shouldShowGenderToggle = (pokemon) => resolveGenderCodes(pokemon).length > 1;

/**
 * Get available form indices for cycling in PokemonImage.
 * When form_id is non-zero the pokemon IS a specific form — no cycling needed.
 * When form_id is 0/null the base row represents all forms, so return 0…forms_count-1.
 */
export const getAvailableForms = (pokemon) => {
  if (pokemon?.form_id) return [pokemon.form_id];
  const count = pokemon?.forms_count ?? 1;
  return Array.from({ length: count }, (_, i) => i);
};

/**
 * Returns a flat list of every image variant for a pokemon: [{formIndex, genderCode, url}].
 * Used by PokemonImage to auto-cycle through all available images.
 */
export const buildVariants = (pokemon) => {
  if (!pokemon?.national_dex_id) return [];

  const genderCodes = resolveGenderCodes(pokemon);
  const formIndices = pokemon?.form_id
    ? [pokemon.form_id]
    : Array.from({ length: pokemon?.forms_count || 1 }, (_, i) => i);

  const variants = [];
  for (const fi of formIndices) {
    for (const genderCode of genderCodes) {
      const effectiveFi = isMoFoPair(pokemon)
        ? resolveFormIndexForGender(pokemon, genderCode)
        : fi;
      variants.push({
        formIndex: effectiveFi,
        genderCode,
        url: buildPokemonImageUrl(pokemon, effectiveFi, genderCode),
      });
    }
  }
  return variants;
};

/** Convert internal gender code to a full display label. */
export const genderCodeToLabel = (code) => {
  const map = {
    md: '♂ (Difference)',
    fd: '♀ (Difference)',
    mo: '♂ (Male Only)',
    fo: '♀ (Female Only)',
    uk: 'Genderless',
    mf: 'Both Genders',
  };
  return map[code] || code;
};

/** Convert internal gender code to a short toggle label. */
export const genderCodeToShort = (code) => {
  const map = {
    md: '♂',
    fd: '♀',
    mo: '♂',
    fo: '♀',
    uk: 'N/A',
    mf: 'Both',
  };
  return map[code] || '?';
};

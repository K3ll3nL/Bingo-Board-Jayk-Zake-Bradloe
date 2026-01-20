const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables!');
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper functions to maintain similar API to SQLite version

const dbAll = async (table, options = {}) => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order(options.orderBy || 'id', { ascending: options.ascending !== false });
  
  if (error) throw error;
  return data;
};

const dbGet = async (table, id) => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
};

const dbInsert = async (table, values) => {
  const { data, error } = await supabase
    .from(table)
    .insert(values)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

const dbUpdate = async (table, id, values) => {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

const dbDelete = async (table, id) => {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
};

const dbUpsert = async (table, values, onConflict) => {
  const { data, error } = await supabase
    .from(table)
    .upsert(values, { onConflict })
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

module.exports = {
  supabase,
  dbAll,
  dbGet,
  dbInsert,
  dbUpdate,
  dbDelete,
  dbUpsert
};

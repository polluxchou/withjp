const MISSING_TABLE_IN_SCHEMA_CACHE_RE =
  /Could not find the table '([^']+)' in the schema cache/i

export function formatSupabaseError(message: string) {
  const match = message.match(MISSING_TABLE_IN_SCHEMA_CACHE_RE)
  if (!match) return message

  const relation = match[1]

  return [
    `Supabase is missing \`${relation}\` in the project configured by \`.env.local\`.`,
    'Run migrations 001, 002, and 003 from supabase/migrations/ against your project, then load supabase/seed.sql and supabase/seed_chat.sql.',
  ].join(' ')
}

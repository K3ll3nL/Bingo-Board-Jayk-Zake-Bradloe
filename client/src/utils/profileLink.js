// Profile URLs are /profile/<display name> with whitespace runs turned into '-'
// ("Big Red" -> /profile/Big-Red). The API resolves the name back to an id
// (GET /api/user-lookup/:slug, case-insensitive). Must match profileSlugKey()
// in api/_routes/users.js, minus the lowercasing — the URL keeps the user's casing.
export const profileSlug = (name) =>
  String(name || '').normalize('NFC').trim().replace(/\s+/g, '-');

export const profileSlugKey = (name) => profileSlug(name).toLowerCase();

// Props for a <Link> to someone's profile. The id rides along as router state,
// so an in-app click opens the profile without a lookup round trip — and
// lands on the right person even when two accounts share a name. Falls back to
// the id URL when the name is unknown.
export const profileLink = (userId, displayName) => {
  const slug = profileSlug(displayName);
  return {
    to: slug ? `/profile/${encodeURIComponent(slug)}` : `/profile/${userId}`,
    state: { userId, displayName },
  };
};

export async function getMembership(db, slug, email) {
  return db.prepare('SELECT role FROM workspace_members WHERE workspace_slug = ?1 AND email = ?2 COLLATE NOCASE')
    .bind(slug, email).first();
}

export async function getInvite(db, slug, email) {
  return db.prepare('SELECT role FROM workspace_invites WHERE workspace_slug = ?1 AND email = ?2 COLLATE NOCASE')
    .bind(slug, email).first();
}

export async function authorizeWorkspace(db, slug, email) {
  const member = await getMembership(db, slug, email);
  if (member) return { ...member, source: 'member' };
  const invite = await getInvite(db, slug, email);
  if (invite) return { ...invite, source: 'invite' };
  return null;
}

export async function activateInvite(db, slug, email, role) {
  const timestamp = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO workspace_members(workspace_slug,email,role,created_at) VALUES(?1,?2,?3,?4)')
      .bind(slug, email, role, timestamp),
    db.prepare('DELETE FROM workspace_invites WHERE workspace_slug=?1 AND email=?2 COLLATE NOCASE')
      .bind(slug, email)
  ]);
  return { role, source: 'member' };
}

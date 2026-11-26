INSERT INTO permissions (id, key)
VALUES
  (gen_random_uuid(), 'clubs.read'),
  (gen_random_uuid(), 'clubs.write'),
  (gen_random_uuid(), 'club.publish')
ON CONFLICT (key) DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'curator')
  AND p.key IN ('clubs.read', 'clubs.write', 'club.publish')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'member'
  AND p.key IN ('clubs.read', 'clubs.write')
ON CONFLICT DO NOTHING;

-- Migration 009: Admin Seeder + User Lock/Disable
-- Adds is_active column to profiles and seeds the first admin user

-- 1. Add is_active column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Add lock_users permission
INSERT INTO permissions (name, description, resource, action)
VALUES ('lock_users', 'Lock or unlock user accounts', 'admin', 'write')
ON CONFLICT (name) DO NOTHING;

-- Grant lock_users to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name = 'lock_users'
ON CONFLICT DO NOTHING;

-- 3. RLS policy: admins can update is_active on profiles
CREATE POLICY "admins_can_update_profiles_is_active"
ON profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  )
);

-- 4. Admin seeder: Promote a specific email to admin
-- CHANGE THIS EMAIL to your actual admin email before running
DO $$
DECLARE
  admin_email TEXT := 'femi@provatix.com';
  target_user_id UUID;
  admin_role_id UUID;
BEGIN
  -- Look up the user by email in profiles
  SELECT id INTO target_user_id FROM profiles WHERE email = admin_email;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'User with email % not found in profiles. Sign up first, then re-run or manually assign admin role.', admin_email;
    RETURN;
  END IF;

  -- Get the admin role id
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';

  IF admin_role_id IS NULL THEN
    RAISE NOTICE 'Admin role not found in roles table.';
    RETURN;
  END IF;

  -- Insert into user_roles (skip if already admin)
  INSERT INTO user_roles (user_id, role_id)
  VALUES (target_user_id, admin_role_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'User % (%) has been promoted to admin.', admin_email, target_user_id;
END $$;

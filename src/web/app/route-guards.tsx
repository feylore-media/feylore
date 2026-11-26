import { Navigate } from "react-router";
import { getAdminSection, getFirstAdminPath } from "@shared/admin-sections";
import { ADMIN_AREA_PERMISSIONS, type Permission } from "@shared/permissions";
import { LoadingState } from "../components/states";
import { useAuth, useAnyPermission, usePermission } from "./auth-context";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const can = usePermission(permission);
  if (!can) {
    return (
      <Navigate
        to={getFirstAdminPath(user?.permissions ?? [])}
        replace
      />
    );
  }
  return <>{children}</>;
}

export function RequireMetadataAccess({
  children,
}: {
  children: React.ReactNode;
}) {
  const permission = getAdminSection("metadata-providers")?.permission;
  if (!permission) return <>{children}</>;
  return <RequirePermission permission={permission}>{children}</RequirePermission>;
}

export function RequireAdminAccess({ children }: { children: React.ReactNode }) {
  const can = useAnyPermission(ADMIN_AREA_PERMISSIONS);
  if (!can) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function AdminSectionRoute({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}) {
  const section = getAdminSection(sectionId);
  if (!section?.permission) return <>{children}</>;
  return (
    <RequirePermission permission={section.permission}>{children}</RequirePermission>
  );
}

import { useAuthStore } from "@/core/auth/store";
import { AdminGuard } from "./AdminGuard";
import { UsersTab } from "./AdminPage";

export function AdminUsersPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const me = useAuthStore((s) => s.user);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin — Users</h1>
      <UsersTab meId={me!.id} />
    </div>
  );
}

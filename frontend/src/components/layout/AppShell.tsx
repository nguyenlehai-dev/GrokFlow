import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Key, Layers, FileText, Settings, LayoutDashboard, Workflow, LogOut, Shield, ScrollText } from "lucide-react";
import { useAuthStore } from "@/core/auth/store";

const baseNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/api-keys", label: "API Keys", icon: Key },
  { to: "/profiles", label: "Profiles", icon: Layers },
  { to: "/jobs", label: "Jobs", icon: Workflow },
  { to: "/api-docs", label: "API Docs", icon: FileText },
  { to: "/audit-logs", label: "Audit Log", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];
const adminNav = [{ to: "/admin", label: "Admin", icon: Shield }];

export function AppShell() {
  const { user, clear } = useAuthStore();
  const navigate = useNavigate();
  const nav = user?.role === "admin" ? [...baseNav, ...adminNav] : baseNav;

  const onLogout = () => {
    clear();
    navigate("/login");
  };

  return (
    <div className="flex h-screen">
      <aside className="w-60 border-r border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-200">
          <Link to="/dashboard" className="text-lg font-semibold text-brand-600">
            GrokFlow
          </Link>
        </div>
        <nav className="p-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">Logged in as <span className="font-medium text-slate-800">{user?.email}</span> ({user?.role})</div>
          <button onClick={onLogout} className="btn-ghost"><LogOut size={16} className="mr-2" />Logout</button>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

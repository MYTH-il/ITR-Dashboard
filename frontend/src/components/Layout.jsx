import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, FileSpreadsheet, MessageSquareWarning, Users,
  Building2, ListOrdered, Settings2, ScrollText, AlertTriangle, LogOut
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/returns", label: "Return Master", icon: FileSpreadsheet, testid: "nav-returns" },
  { to: "/queries", label: "Queries", icon: MessageSquareWarning, testid: "nav-queries" },
  { to: "/escalations", label: "Escalations", icon: AlertTriangle, testid: "nav-escalations" },
];

const adminItems = [
  { to: "/masters/clients", label: "Client Master", icon: Building2, testid: "nav-clients" },
  { to: "/masters/stages", label: "Workflow Stages", icon: ListOrdered, testid: "nav-workflow-stages" },
  { to: "/masters/users", label: "User Directory", icon: Users, testid: "nav-users" },
  { to: "/masters/dropdowns", label: "Dropdown Options", icon: Settings2, testid: "nav-dropdowns" },
  { to: "/audit", label: "Audit Trail", icon: ScrollText, testid: "nav-audit-trail" },
];

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-200">
          <div className="w-9 h-9 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold tracking-tight" style={{ fontFamily: "Outfit" }}>IT</div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>TaxOps</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ITR Ops Console</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 px-3 py-2">Operations</div>
          {navItems.map((it) => (
            <NavItem key={it.to} {...it} />
          ))}

          {isAdmin && (
            <>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 px-3 py-2 mt-4">Administration</div>
              {adminItems.map((it) => (
                <NavItem key={it.to} {...it} />
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-white flex items-center justify-center text-sm font-semibold">
              {user?.name?.slice(0, 1)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
            </div>
            <button
              data-testid="logout-button"
              onClick={onLogout}
              className="p-2 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-900"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="px-2">
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              {user?.role}
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen">
        <header className="sticky top-0 z-20 h-14 bg-white/80 backdrop-blur-xl border-b border-slate-200 flex items-center px-6">
          <div className="text-sm text-slate-500">
            <span className="text-emerald-700 font-semibold">Live</span>
            <span className="mx-2">•</span>
            <span>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, testid }) {
  return (
    <NavLink
      data-testid={testid}
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`
      }
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </NavLink>
  );
}

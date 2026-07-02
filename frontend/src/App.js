import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Returns from "@/pages/Returns";
import ReturnDetail from "@/pages/ReturnDetail";
import Queries from "@/pages/Queries";
import Clients from "@/pages/Clients";
import WorkflowStages from "@/pages/WorkflowStages";
import Users from "@/pages/Users";
import Dropdowns from "@/pages/Dropdowns";
import AuditTrail from "@/pages/AuditTrail";
import Escalations from "@/pages/Escalations";

function Protected({ children, adminOnly }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/returns" element={<Protected><Returns /></Protected>} />
          <Route path="/returns/:id" element={<Protected><ReturnDetail /></Protected>} />
          <Route path="/queries" element={<Protected><Queries /></Protected>} />
          <Route path="/escalations" element={<Protected><Escalations /></Protected>} />
          <Route path="/masters/clients" element={<Protected adminOnly><Clients /></Protected>} />
          <Route path="/masters/stages" element={<Protected adminOnly><WorkflowStages /></Protected>} />
          <Route path="/masters/users" element={<Protected adminOnly><Users /></Protected>} />
          <Route path="/masters/dropdowns" element={<Protected adminOnly><Dropdowns /></Protected>} />
          <Route path="/audit" element={<Protected><AuditTrail /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

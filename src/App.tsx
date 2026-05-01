import { Component, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { I18nProvider } from "./i18n/I18nContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ResetPassword from "./pages/ResetPassword";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace" }}>
          <h1>Error</h1>
          <pre style={{ whiteSpace: "pre-wrap", color: "red" }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  if (window.location.pathname === "/reset-password") return <ResetPassword />;
  return isAuthenticated ? <Dashboard /> : <Login />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

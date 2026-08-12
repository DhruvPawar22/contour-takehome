import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function AppShell() {
  const { user, role, loading, error, logout } = useAuth();

  if (loading) {
    return (
      <div className="full-page-message">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!role) {
    return (
      <div className="full-page-message">
        <div className="card full-page-message-card">
          <h2>Not a recognized staff member</h2>
          <p>{error ?? 'This account has no matching entry in the staff roster.'}</p>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;

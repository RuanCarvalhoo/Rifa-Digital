import { Routes, Route, Link, NavLink } from 'react-router-dom';
import RafflesPage from './pages/RafflesPage.jsx';
import RaffleDetailPage from './pages/RaffleDetailPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">🎟️ Rifinha Digital</Link>
        <nav className="nav">
          <NavLink to="/" end>Rifas</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<RafflesPage />} />
          <Route path="/rifas/:id" element={<RaffleDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<p>Página não encontrada.</p>} />
        </Routes>
      </main>

      <footer className="footer">
        Rifinha Digital — projeto de demonstração.
      </footer>
    </div>
  );
}

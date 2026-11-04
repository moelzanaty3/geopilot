import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Catalogue from './pages/Catalogue.jsx';

function Nav() {
  const navigate = useNavigate();
  return (
    <nav>
      <Link to="/">Home</Link>
      <button onClick={() => navigate('/catalogue')}>Catalogue</button>
    </nav>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Nav />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/catalogue" element={<Catalogue />} />
    </Routes>
  </BrowserRouter>,
);

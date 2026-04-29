import { useState } from 'react';
import { login } from '../services/api';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Completa todos los campos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await login(username, password);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('agent', JSON.stringify(res.data.agent));
      onLogin(res.data.agent);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🚖</div>
          <h1 className="text-2xl font-bold text-gray-800">TaxiWhatsApp</h1>
          <p className="text-gray-500 text-sm mt-1">Panel de operadores</p>
        </div>

        {/* Formulario */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="operador1"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-2.5 rounded-xl transition-colors"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </div>

        {/* Info de prueba */}
        <div className="mt-6 bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Usuarios de prueba:</p>
          <div className="space-y-1">
            {['operador1', 'operador2', 'operador3'].map(u => (
              <button
                key={u}
                onClick={() => { setUsername(u); setPassword('password'); }}
                className="block w-full text-left text-xs text-green-600 hover:text-green-700"
              >
                {u} / password
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
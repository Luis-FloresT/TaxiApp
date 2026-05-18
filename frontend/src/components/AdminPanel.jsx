import { useEffect, useState } from 'react';
import {
  createAgent,
  createWhatsAppNumber,
  getAgents,
  getReportSummary,
  getWhatsAppNumbers,
  resetAgentPassword,
  updateAgent
} from '../services/api';

const emptyUser = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'operator'
};

const isAdminRole = (role) => ['admin', 'superadmin'].includes(role);

const emptyLine = {
  label: '',
  phoneNumberId: '',
  displayPhone: ''
};

const AdminPanel = ({ agent, onClose, onLinesChanged, fullPage = false, onLogout, onOpenOperatorPanel }) => {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [lines, setLines] = useState([]);
  const [newUser, setNewUser] = useState(emptyUser);
  const [newLine, setNewLine] = useState(emptyLine);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const loadAll = () => {
    setError('');
    Promise.all([getAgents(), getReportSummary(), getWhatsAppNumbers()])
      .then(([usersRes, summaryRes, linesRes]) => {
        setUsers(usersRes.data);
        setSummary(summaryRes.data);
        setLines(linesRes.data);
      })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el panel admin'));
  };

  useEffect(() => {
    const timer = window.setTimeout(loadAll, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setSaving('user');
    setError('');

    try {
      await createAgent(newUser);
      setNewUser(emptyUser);
      const res = await getAgents();
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el usuario');
    } finally {
      setSaving('');
    }
  };

  const handleUpdateUser = async (id, patch) => {
    setSaving(`user-${id}`);
    setError('');

    try {
      const res = await updateAgent(id, patch);
      setUsers(current => current.map(user => (user.id === id ? res.data : user)));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el usuario');
    } finally {
      setSaving('');
    }
  };

  const handleResetPassword = async (user) => {
    const password = prompt(`Nueva contraseña para ${user.username}`);
    if (!password) return;

    setSaving(`password-${user.id}`);
    setError('');

    try {
      await resetAgentPassword(user.id, password);
      alert('Contraseña actualizada');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la contraseña');
    } finally {
      setSaving('');
    }
  };

  const handleCreateLine = async (event) => {
    event.preventDefault();
    setSaving('line');
    setError('');

    try {
      await createWhatsAppNumber(newLine);
      setNewLine(emptyLine);
      const res = await getWhatsAppNumbers();
      setLines(res.data);
      onLinesChanged?.(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo agregar la línea');
    } finally {
      setSaving('');
    }
  };

  const today = summary?.today || {};
  const totals = summary?.totals || {};
  const agentStats = summary?.agents || {};

  const panelContent = (
    <div className={fullPage ? 'min-h-screen bg-gray-100' : ''}>
      <div className={fullPage ? 'mx-auto w-full max-w-7xl bg-white min-h-screen' : 'bg-white w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-xl shadow-xl'}>
        <div className="px-6 py-4 border-b flex items-center justify-between bg-white">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Administración TaxiWhatsApp</h2>
            <p className="text-sm text-gray-500">
              {agent?.name} · {agent?.role === 'superadmin' ? 'Superusuario' : 'Administrador'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenOperatorPanel && (
              <button
                type="button"
                onClick={onOpenOperatorPanel}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Panel operativo
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-900"
              >
                Salir
              </button>
            )}
            {onClose && !fullPage && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            )}
          </div>
        </div>

        <div className="border-b px-6 pt-3 flex flex-wrap gap-2">
          {[
            ['users', 'Usuarios'],
            ['stats', 'Estadísticas'],
            ['lines', 'Líneas WhatsApp']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`px-3 py-2 text-sm font-medium border-b-2 ${
                tab === value
                  ? 'border-green-500 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {tab === 'users' && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <form onSubmit={handleCreateUser} className="border border-gray-200 rounded-lg p-4 space-y-3 h-fit">
              <h3 className="font-semibold text-gray-800">Crear usuario</h3>
              <input
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Nombre del operador"
              />
              <input
                value={newUser.username}
                onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="usuario"
              />
              <input
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="correo opcional"
              />
              <input
                type="password"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="contraseña"
              />
              <select
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="operator">Operador</option>
                <option value="admin">Admin</option>
                {agent?.role === 'superadmin' && <option value="superadmin">Superadmin</option>}
              </select>
              <button
                disabled={saving === 'user'}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
              >
                {saving === 'user' ? 'Creando...' : 'Crear usuario'}
              </button>
            </form>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">
                <span>Usuario</span>
                <span>Rol</span>
                <span>Estado</span>
                <span className="text-right">Acciones</span>
              </div>
              {users.map(user => (
                <div key={user.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center border-t px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{user.name}</p>
                    <p className="text-xs text-gray-500">@{user.username}{user.email ? ` · ${user.email}` : ''}</p>
                  </div>
                  {user.role === 'superadmin' && agent?.role !== 'superadmin' ? (
                    <span className="w-fit rounded-lg bg-purple-50 px-2 py-1 text-xs text-purple-700">
                      Superadmin
                    </span>
                  ) : (
                    <select
                      value={user.role}
                      onChange={e => handleUpdateUser(user.id, { role: e.target.value })}
                      disabled={saving === `user-${user.id}`}
                      className="w-fit border rounded-lg px-2 py-1 text-xs bg-white"
                    >
                      <option value="operator">Operador</option>
                      <option value="admin">Admin</option>
                      {agent?.role === 'superadmin' && <option value="superadmin">Superadmin</option>}
                    </select>
                  )}
                  <button
                    type="button"
                    disabled={user.id === agent?.id || (user.role === 'superadmin' && agent?.role !== 'superadmin') || saving === `user-${user.id}`}
                    onClick={() => handleUpdateUser(user.id, { active: !user.active })}
                    className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${
                      user.active
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    } disabled:opacity-50`}
                  >
                    {user.active ? 'Activo' : 'Inactivo'}
                  </button>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleResetPassword(user)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Clave
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="p-6 space-y-6">
            {!summary ? (
              <div className="text-center text-gray-400 py-8">Cargando estadísticas...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Chats nuevos hoy', today.new_chats_today],
                    ['Despachos hoy', today.dispatched_today],
                    ['Finalizadas hoy', today.completed_today],
                    ['Usuarios activos', agentStats.active_users]
                  ].map(([label, value]) => (
                    <div key={label} className="border border-gray-200 rounded-lg p-4">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-2xl font-bold text-gray-800 mt-1">{value ?? 0}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <section className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">Totales del sistema</h3>
                    {[
                      ['Clientes', totals.total_customers],
                      ['Chats taxistas', totals.total_driver_chats],
                      ['Chats abiertos', totals.open_chats],
                      ['Archivados', totals.archived_chats],
                      ['Admins', agentStats.admins],
                      ['Operadores', agentStats.operators]
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between border-t first:border-t-0 py-2 text-sm">
                        <span className="text-gray-500">{label}</span>
                        <span className="font-semibold text-gray-800">{value ?? 0}</span>
                      </div>
                    ))}
                  </section>

                  <section className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">Por línea</h3>
                    {(summary.by_line || []).map(item => (
                      <div key={item.line} className="border-t first:border-t-0 py-2 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium text-gray-800">{item.line}</span>
                          <span className="text-gray-500">{item.open_chats} abiertos</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          Hoy: {item.new_today} chats · {item.dispatched_today} despachos
                        </p>
                      </div>
                    ))}
                  </section>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'lines' && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <form onSubmit={handleCreateLine} className="border border-gray-200 rounded-lg p-4 space-y-3 h-fit">
              <h3 className="font-semibold text-gray-800">Agregar línea</h3>
              <input
                value={newLine.label}
                onChange={e => setNewLine({ ...newLine, label: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Línea 2 - Respaldo"
              />
              <input
                value={newLine.phoneNumberId}
                onChange={e => setNewLine({ ...newLine, phoneNumberId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Phone Number ID de Meta"
              />
              <input
                value={newLine.displayPhone}
                onChange={e => setNewLine({ ...newLine, displayPhone: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="593..."
              />
              <button
                disabled={saving === 'line'}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
              >
                {saving === 'line' ? 'Guardando...' : 'Agregar línea'}
              </button>
            </form>

            <div className="border border-gray-200 rounded-lg divide-y">
              {lines.length === 0 ? (
                <div className="p-6 text-sm text-gray-400">No hay líneas configuradas.</div>
              ) : lines.map(line => (
                <div key={line.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-800">{line.label}</p>
                    <p className="text-xs text-gray-500">
                      +{line.display_phone_number || 'sin número visible'} · ID {line.phone_number_id}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${line.is_default ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {line.is_default ? 'Principal' : 'Activa'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (fullPage) {
    if (!isAdminRole(agent?.role)) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow p-6 max-w-md text-center">
            <h1 className="text-xl font-semibold text-gray-800">Acceso restringido</h1>
            <p className="text-sm text-gray-500 mt-2">Este panel es solo para administradores.</p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white"
            >
              Salir
            </button>
          </div>
        </div>
      );
    }

    return panelContent;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      {panelContent}
    </div>
  );
};

export default AdminPanel;

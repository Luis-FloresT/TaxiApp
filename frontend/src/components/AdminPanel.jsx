import { useEffect, useState } from 'react';
import {
  bulkDeleteCustomerChats,
  createAgent,
  createCustomerContacts,
  createDriver,
  createWhatsAppNumber,
  deleteAgent,
  deleteChat,
  deleteDriver,
  deleteWhatsAppNumber,
  getAgents,
  getChats,
  getDrivers,
  getReportSummary,
  getWhatsAppNumbers,
  resetAgentPassword,
  updateAgent,
  updateChatContact,
  updateDriver,
  updateWhatsAppNumber
} from '../services/api';

const emptyUser = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'operator',
  can_view_all_numbers: true,
  can_switch_numbers: true,
  default_whatsapp_number_id: '',
  allowed_whatsapp_number_ids: []
};

const isAdminRole = (role) => ['admin', 'superadmin'].includes(role);

const emptyLine = {
  label: '',
  phoneNumberId: '',
  displayPhone: ''
};

const emptyDriver = {
  name: '',
  phoneNumber: '',
  vehicleLabel: '',
  availabilityStatus: 'available'
};

const emptyCustomer = {
  name: '',
  phoneNumber: '',
  note: ''
};

const availabilityLabels = {
  available: 'Disponible',
  busy: 'Ocupado',
  offline: 'Fuera de turno'
};

const getLineAccessMode = (user) => {
  if (user.can_view_all_numbers !== false) return 'all';
  return user.can_switch_numbers !== false ? 'assigned' : 'fixed';
};

const getLineLabel = (lines, id) => {
  const line = lines.find(item => String(item.id) === String(id));
  if (!line) return 'Sin línea fija';
  return `${line.label}${line.display_phone_number ? ` · +${line.display_phone_number}` : ''}`;
};

const AdminPanel = ({ agent, onClose, onLinesChanged, fullPage = false, onLogout, onOpenOperatorPanel }) => {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [lines, setLines] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [newUser, setNewUser] = useState(emptyUser);
  const [newLine, setNewLine] = useState(emptyLine);
  const [newDriver, setNewDriver] = useState(emptyDriver);
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [includeOpenRides, setIncludeOpenRides] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userDrafts, setUserDrafts] = useState({});
  const [lineDrafts, setLineDrafts] = useState({});
  const [driverDrafts, setDriverDrafts] = useState({});
  const [customerDrafts, setCustomerDrafts] = useState({});

  const loadAll = () => {
    setError('');
    Promise.all([
      getAgents(),
      getReportSummary(),
      getWhatsAppNumbers(),
      getDrivers(),
      getChats({ limit: 200, offset: 0, whatsappNumberId: 'all' })
    ])
      .then(([usersRes, summaryRes, linesRes, driversRes, chatsRes]) => {
        setUsers(usersRes.data);
        setSummary(summaryRes.data);
        setLines(linesRes.data);
        setDrivers(driversRes.data);
        setCustomers(chatsRes.data.filter(chat => chat.contact_type !== 'driver'));
      })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el panel admin'));
  };

  const getAllowedLineIds = (user) => (
    Array.isArray(user.allowed_whatsapp_number_ids) ? user.allowed_whatsapp_number_ids.map(String) : []
  );

  const buildAccessPatch = (user, mode, extra = {}) => {
    const firstLineId = lines[0]?.id || null;
    const currentAllowed = getAllowedLineIds(user);
    const fallbackDefault = user.default_whatsapp_number_id || currentAllowed[0] || firstLineId;
    const defaultLineId = extra.default_whatsapp_number_id ?? fallbackDefault ?? null;
    const allowedLineIds = extra.allowed_whatsapp_number_ids ?? (
      currentAllowed.length ? currentAllowed : (defaultLineId ? [defaultLineId] : [])
    );

    if (mode === 'all') {
      return {
        can_view_all_numbers: true,
        can_switch_numbers: true,
        default_whatsapp_number_id: defaultLineId || null,
        allowed_whatsapp_number_ids: allowedLineIds
      };
    }

    if (mode === 'fixed') {
      return {
        can_view_all_numbers: false,
        can_switch_numbers: false,
        default_whatsapp_number_id: defaultLineId || null,
        allowed_whatsapp_number_ids: defaultLineId ? [defaultLineId] : allowedLineIds
      };
    }

    return {
      can_view_all_numbers: false,
      can_switch_numbers: true,
      default_whatsapp_number_id: defaultLineId || null,
      allowed_whatsapp_number_ids: allowedLineIds
    };
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

  const handleSaveUserProfile = async (user) => {
    const draft = userDrafts[user.id] || {};
    await handleUpdateUser(user.id, {
      name: draft.name ?? user.name,
      email: draft.email ?? user.email ?? ''
    });
    setEditingUserId(null);
  };

  const handleDeleteUser = async (user) => {
    const ok = confirm(
      `¿Eliminar el usuario ${user.name} (@${user.username})?\n\nNo se borrarán los chats, pero este operador ya no podrá iniciar sesión.`
    );
    if (!ok) return;

    setSaving(`delete-${user.id}`);
    setError('');

    try {
      await deleteAgent(user.id);
      setUsers(current => current.filter(item => item.id !== user.id));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar el usuario');
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

  const handleUpdateLine = async (line) => {
    const draft = lineDrafts[line.id] || line;
    setSaving(`line-${line.id}`);
    setError('');

    try {
      await updateWhatsAppNumber(line.id, {
        label: draft.label,
        phoneNumberId: draft.phone_number_id,
        displayPhone: draft.display_phone_number,
        isDefault: draft.is_default
      });
      const res = await getWhatsAppNumbers();
      setLines(res.data);
      onLinesChanged?.(res.data);
      setLineDrafts({});
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar la línea');
    } finally {
      setSaving('');
    }
  };

  const handleDeleteLine = async (line) => {
    const ok = confirm(`¿Desactivar la línea ${line.label}?\n\nNo se borrarán chats históricos, pero ya no aparecerá para trabajar.`);
    if (!ok) return;

    setSaving(`delete-line-${line.id}`);
    setError('');

    try {
      await deleteWhatsAppNumber(line.id);
      const res = await getWhatsAppNumbers();
      setLines(res.data);
      onLinesChanged?.(res.data);
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo desactivar la línea');
    } finally {
      setSaving('');
    }
  };

  const handleCreateDriver = async (event) => {
    event.preventDefault();
    setSaving('driver');
    setError('');

    try {
      await createDriver(newDriver);
      setNewDriver(emptyDriver);
      const res = await getDrivers();
      setDrivers(res.data);
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el chofer');
    } finally {
      setSaving('');
    }
  };

  const handleUpdateDriver = async (driver) => {
    const draft = driverDrafts[driver.id] || driver;
    setSaving(`driver-${driver.id}`);
    setError('');

    try {
      const res = await updateDriver(driver.id, {
        name: draft.name,
        phoneNumber: draft.phone_number,
        vehicleLabel: draft.vehicle_label,
        availabilityStatus: draft.availability_status
      });
      setDrivers(current => current.map(item => (item.id === driver.id ? res.data : item)));
      setDriverDrafts(current => ({ ...current, [driver.id]: res.data }));
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el chofer');
    } finally {
      setSaving('');
    }
  };

  const handleDeleteDriver = async (driver) => {
    const ok = confirm(`¿Desactivar a ${driver.name || driver.phone_number}?`);
    if (!ok) return;

    setSaving(`delete-driver-${driver.id}`);
    setError('');

    try {
      await deleteDriver(driver.id);
      setDrivers(current => current.filter(item => item.id !== driver.id));
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo desactivar el chofer');
    } finally {
      setSaving('');
    }
  };

  const handleCreateCustomer = async (event) => {
    event.preventDefault();
    setSaving('customer');
    setError('');

    try {
      await createCustomerContacts(newCustomer);
      setNewCustomer(emptyCustomer);
      const res = await getChats({ limit: 200, offset: 0, whatsappNumberId: 'all' });
      setCustomers(res.data.filter(chat => chat.contact_type !== 'driver'));
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      const detail = err.response?.data?.errors?.[0]?.error || err.response?.data?.error;
      setError(detail || 'No se pudo guardar el cliente');
    } finally {
      setSaving('');
    }
  };

  const handleUpdateCustomer = async (customer) => {
    const draft = customerDrafts[customer.id] || customer;
    setSaving(`customer-${customer.id}`);
    setError('');

    try {
      const res = await updateChatContact(customer.id, {
        name: draft.contact_name,
        phoneNumber: draft.phone_number,
        status: draft.status
      });
      setCustomers(current => current.map(item => (item.id === customer.id ? res.data : item)));
      setCustomerDrafts(current => ({ ...current, [customer.id]: res.data }));
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el cliente');
    } finally {
      setSaving('');
    }
  };

  const handleDeleteCustomer = async (customer) => {
    const ok = confirm(`¿Borrar el chat de ${customer.contact_name || customer.phone_number}?\n\nEsto elimina el historial de mensajes de ese cliente.`);
    if (!ok) return;

    setSaving(`delete-customer-${customer.id}`);
    setError('');

    try {
      await deleteChat(customer.id);
      setCustomers(current => current.filter(item => item.id !== customer.id));
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar el cliente');
    } finally {
      setSaving('');
    }
  };

  const handleBulkDeleteCustomers = async (period) => {
    const labels = {
      today: 'hoy',
      week: 'los últimos 7 días',
      all: 'todos los clientes guardados'
    };
    const scope = includeOpenRides
      ? 'También se borrarán clientes pendientes y carreras activas.'
      : 'Solo se borrarán clientes con carreras finalizadas o canceladas.';
    const ok = confirm(
      `¿Borrar chats de clientes de ${labels[period]}?\n\n${scope}\n\nEsto aplica a todos los operadores y todas las líneas. Los chats de taxistas no se borrarán.`
    );

    if (!ok) return;

    setSaving(`cleanup-${period}`);
    setError('');

    try {
      const res = await bulkDeleteCustomerChats(period, includeOpenRides);
      alert(`Limpieza completada. Chats borrados: ${res.data.deleted_count}`);
      loadAll();
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron borrar los chats');
    } finally {
      setSaving('');
    }
  };

  const downloadStatsPdf = async () => {
    if (!summary) return;

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const date = new Date().toLocaleString('es-EC');
    let y = 18;

    doc.setFontSize(18);
    doc.text('Reporte TaxiWhatsApp', 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Generado: ${date}`, 14, y);
    y += 12;

    const addSection = (title) => {
      doc.setFontSize(13);
      doc.text(title, 14, y);
      y += 7;
      doc.setFontSize(10);
    };

    const addRow = (label, value) => {
      if (y > 275) {
        doc.addPage();
        y = 18;
      }
      doc.text(String(label), 16, y);
      doc.text(String(value ?? 0), 180, y, { align: 'right' });
      y += 6;
    };

    addSection('Resumen de hoy');
    addRow('Chats nuevos hoy', today.new_chats_today);
    addRow('Despachos hoy', today.dispatched_today);
    addRow('Finalizadas hoy', today.completed_today);
    addRow('Canceladas hoy', today.cancelled_today);
    y += 4;

    addSection('Totales del sistema');
    addRow('Clientes', totals.total_customers);
    addRow('Chats taxistas', totals.total_driver_chats);
    addRow('Chats abiertos', totals.open_chats);
    addRow('Archivados', totals.archived_chats);
    addRow('Usuarios activos', agentStats.active_users);
    addRow('Admins', agentStats.admins);
    addRow('Operadores', agentStats.operators);
    y += 4;

    addSection('Actividad por línea');
    (summary.by_line || []).forEach(item => {
      addRow(`${item.line} - abiertos`, item.open_chats);
      addRow(`${item.line} - chats hoy`, item.new_today);
      addRow(`${item.line} - despachos hoy`, item.dispatched_today);
    });
    y += 4;

    addSection('Taxistas con más despachos en 7 días');
    (summary.top_drivers_7d || []).forEach(item => addRow(item.driver, item.total));
    y += 4;

    addSection('Atención');
    addRow('Tiempo promedio primera respuesta', `${summary.response?.avg_first_response_minutes ?? 0} min`);

    doc.save(`reporte-taxiwhatsapp-${new Date().toISOString().slice(0, 10)}.pdf`);
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
            ['drivers', 'Choferes'],
            ['customers', 'Clientes'],
            ['stats', 'Estadísticas'],
            ['cleanup', 'Limpieza'],
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
              <select
                value={getLineAccessMode(newUser)}
                onChange={e => setNewUser({ ...newUser, ...buildAccessPatch(newUser, e.target.value) })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="all">Puede ver y cambiar todos los números</option>
                <option value="assigned">Puede cambiar solo entre números asignados</option>
                <option value="fixed">Número fijo asignado</option>
              </select>
              {getLineAccessMode(newUser) !== 'all' && (
                <select
                  value={newUser.default_whatsapp_number_id || ''}
                  onChange={e => {
                    const lineId = e.target.value;
                    setNewUser({
                      ...newUser,
                      ...buildAccessPatch(newUser, getLineAccessMode(newUser), {
                        default_whatsapp_number_id: lineId,
                        allowed_whatsapp_number_ids: [lineId]
                      })
                    });
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Selecciona número asignado</option>
                  {lines.map(line => (
                    <option key={line.id} value={line.id}>{getLineLabel(lines, line.id)}</option>
                  ))}
                </select>
              )}
              <button
                disabled={saving === 'user'}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
              >
                {saving === 'user' ? 'Creando...' : 'Crear usuario'}
              </button>
            </form>

            <div className="space-y-3">
              {users.map(user => (
                <div key={user.id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      {editingUserId === user.id ? (
                        <div className="space-y-2">
                          <input
                            value={userDrafts[user.id]?.name ?? user.name}
                            onChange={e => setUserDrafts(current => ({
                              ...current,
                              [user.id]: { ...current[user.id], name: e.target.value }
                            }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            placeholder="Nombre visible"
                          />
                          <input
                            value={userDrafts[user.id]?.email ?? user.email ?? ''}
                            onChange={e => setUserDrafts(current => ({
                              ...current,
                              [user.id]: { ...current[user.id], email: e.target.value }
                            }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            placeholder="correo opcional"
                          />
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-gray-800">{user.name}</p>
                          <p className="text-xs text-gray-500">@{user.username}{user.email ? ` · ${user.email}` : ''}</p>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 md:grid-cols-[220px_1fr_220px]">
                    <label className="text-xs font-medium text-gray-600">
                      Acceso a números
                      <select
                        value={getLineAccessMode(user)}
                        onChange={e => handleUpdateUser(user.id, buildAccessPatch(user, e.target.value))}
                        disabled={saving === `user-${user.id}` || (user.role === 'superadmin' && agent?.role !== 'superadmin')}
                        className="mt-1 w-full border rounded-lg px-2 py-2 text-xs bg-white"
                      >
                        <option value="all">Ve todos y puede cambiar</option>
                        <option value="assigned">Cambia entre asignados</option>
                        <option value="fixed">Número fijo</option>
                      </select>
                    </label>

                    <div className="text-xs text-gray-600">
                      <p className="font-medium">Números asignados</p>
                      {getLineAccessMode(user) === 'all' ? (
                        <p className="mt-2 text-gray-400">Tiene acceso a todas las líneas activas.</p>
                      ) : (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {lines.map(line => {
                            const allowed = getAllowedLineIds(user).includes(String(line.id));
                            return (
                              <label key={line.id} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={allowed}
                                  disabled={saving === `user-${user.id}` || getLineAccessMode(user) === 'fixed'}
                                  onChange={e => {
                                    const currentIds = getAllowedLineIds(user);
                                    const nextIds = e.target.checked
                                      ? [...new Set([...currentIds, String(line.id)])]
                                      : currentIds.filter(id => id !== String(line.id));
                                    handleUpdateUser(user.id, buildAccessPatch(user, getLineAccessMode(user), {
                                      allowed_whatsapp_number_ids: nextIds,
                                      default_whatsapp_number_id: nextIds.includes(String(user.default_whatsapp_number_id))
                                        ? user.default_whatsapp_number_id
                                        : nextIds[0] || null
                                    }));
                                  }}
                                />
                                <span>{getLineLabel(lines, line.id)}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <label className="text-xs font-medium text-gray-600">
                      Número principal
                      <select
                        value={user.default_whatsapp_number_id || ''}
                        onChange={e => {
                          const lineId = e.target.value || null;
                          const mode = getLineAccessMode(user);
                          const allowedIds = mode === 'fixed'
                            ? (lineId ? [lineId] : [])
                            : [...new Set([...getAllowedLineIds(user), lineId].filter(Boolean))];
                          handleUpdateUser(user.id, buildAccessPatch(user, mode, {
                            default_whatsapp_number_id: lineId,
                            allowed_whatsapp_number_ids: allowedIds
                          }));
                        }}
                        disabled={saving === `user-${user.id}` || lines.length === 0}
                        className="mt-1 w-full border rounded-lg px-2 py-2 text-xs bg-white"
                      >
                        <option value="">Sin fijo</option>
                        {lines.map(line => (
                          <option key={line.id} value={line.id}>{getLineLabel(lines, line.id)}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {editingUserId === user.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSaveUserProfile(user)}
                          disabled={saving === `user-${user.id}`}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Guardar nombre
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUserId(null)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserId(user.id);
                          setUserDrafts(current => ({
                            ...current,
                            [user.id]: { name: user.name, email: user.email || '' }
                          }));
                        }}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        Editar nombre
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleResetPassword(user)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Clave
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user)}
                      disabled={user.id === agent?.id || (user.role === 'superadmin' && agent?.role !== 'superadmin') || saving === `delete-${user.id}`}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {saving === `delete-${user.id}` ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'drivers' && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <form onSubmit={handleCreateDriver} className="border border-gray-200 rounded-lg p-4 space-y-3 h-fit">
              <h3 className="font-semibold text-gray-800">Agregar chofer</h3>
              <input
                value={newDriver.name}
                onChange={e => setNewDriver({ ...newDriver, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Nombre del chofer"
              />
              <input
                value={newDriver.phoneNumber}
                onChange={e => setNewDriver({ ...newDriver, phoneNumber: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Celular WhatsApp 593..."
              />
              <input
                value={newDriver.vehicleLabel}
                onChange={e => setNewDriver({ ...newDriver, vehicleLabel: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Unidad / placa"
              />
              <select
                value={newDriver.availabilityStatus}
                onChange={e => setNewDriver({ ...newDriver, availabilityStatus: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="available">Disponible</option>
                <option value="busy">Ocupado</option>
                <option value="offline">Fuera de turno</option>
              </select>
              <button
                disabled={saving === 'driver' || !newDriver.phoneNumber.trim()}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
              >
                {saving === 'driver' ? 'Guardando...' : 'Guardar chofer'}
              </button>
            </form>

            <div className="space-y-3">
              {drivers.length === 0 ? (
                <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-400">No hay choferes registrados.</div>
              ) : drivers.map(driver => {
                const draft = driverDrafts[driver.id] || driver;
                return (
                  <div key={driver.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_150px] gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          value={draft.name || ''}
                          onChange={e => setDriverDrafts(current => ({
                            ...current,
                            [driver.id]: { ...draft, name: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Nombre"
                        />
                        <input
                          value={draft.phone_number || ''}
                          onChange={e => setDriverDrafts(current => ({
                            ...current,
                            [driver.id]: { ...draft, phone_number: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Celular"
                        />
                        <input
                          value={draft.vehicle_label || ''}
                          onChange={e => setDriverDrafts(current => ({
                            ...current,
                            [driver.id]: { ...draft, vehicle_label: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Unidad"
                        />
                      </div>
                      <select
                        value={draft.availability_status || 'available'}
                        onChange={e => setDriverDrafts(current => ({
                          ...current,
                          [driver.id]: { ...draft, availability_status: e.target.value }
                        }))}
                        className="border rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="available">Disponible</option>
                        <option value="busy">Ocupado</option>
                        <option value="offline">Fuera de turno</option>
                      </select>
                      <div className="flex gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => handleUpdateDriver(driver)}
                          disabled={saving === `driver-${driver.id}`}
                          className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDriver(driver)}
                          disabled={saving === `delete-driver-${driver.id}`}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Estado actual: {availabilityLabels[driver.availability_status] || 'Sin estado'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'customers' && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <form onSubmit={handleCreateCustomer} className="border border-gray-200 rounded-lg p-4 space-y-3 h-fit">
              <h3 className="font-semibold text-gray-800">Agregar cliente</h3>
              <input
                value={newCustomer.name}
                onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Nombre del cliente"
              />
              <input
                value={newCustomer.phoneNumber}
                onChange={e => setNewCustomer({ ...newCustomer, phoneNumber: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Celular WhatsApp 593..."
              />
              <textarea
                value={newCustomer.note}
                onChange={e => setNewCustomer({ ...newCustomer, note: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-24"
                placeholder="Nota inicial opcional"
              />
              <button
                disabled={saving === 'customer' || !newCustomer.phoneNumber.trim()}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
              >
                {saving === 'customer' ? 'Guardando...' : 'Guardar cliente'}
              </button>
            </form>

            <div className="space-y-3">
              {customers.length === 0 ? (
                <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-400">No hay clientes registrados.</div>
              ) : customers.map(customer => {
                const draft = customerDrafts[customer.id] || customer;
                return (
                  <div key={customer.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_150px] gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          value={draft.contact_name || ''}
                          onChange={e => setCustomerDrafts(current => ({
                            ...current,
                            [customer.id]: { ...draft, contact_name: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Nombre"
                        />
                        <input
                          value={draft.phone_number || ''}
                          onChange={e => setCustomerDrafts(current => ({
                            ...current,
                            [customer.id]: { ...draft, phone_number: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Celular"
                        />
                        <select
                          value={draft.status || 'active'}
                          onChange={e => setCustomerDrafts(current => ({
                            ...current,
                            [customer.id]: { ...draft, status: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm bg-white"
                        >
                          <option value="active">Activo</option>
                          <option value="pending">Pendiente</option>
                          <option value="closed">Archivado</option>
                        </select>
                      </div>
                      <div className="flex gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => handleUpdateCustomer(customer)}
                          disabled={saving === `customer-${customer.id}`}
                          className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomer(customer)}
                          disabled={saving === `delete-customer-${customer.id}`}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Línea: {customer.whatsapp_label || customer.line_key || 'Sin línea'} · Carrera: {customer.ride_status || 'sin estado'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="p-6 space-y-6">
            {!summary ? (
              <div className="text-center text-gray-400 py-8">Cargando estadísticas...</div>
            ) : (
              <>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={downloadStatsPdf}
                    className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                  >
                    Descargar PDF
                  </button>
                </div>
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

        {tab === 'cleanup' && (
          <div className="p-6 space-y-6">
            <section className="rounded-lg border border-red-100 bg-red-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-red-700">Borrar chats de clientes</h3>
                  <p className="mt-1 text-sm text-red-700">
                    Limpia chats de clientes de todos los operadores y todas las líneas. Los taxistas no se borran.
                  </p>
                </div>
                <span className="text-2xl">🗑️</span>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeOpenRides}
                  onChange={e => setIncludeOpenRides(e.target.checked)}
                />
                Incluir clientes pendientes y carreras activas
              </label>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  ['today', 'Borrar clientes de hoy'],
                  ['week', 'Borrar últimos 7 días'],
                  ['all', 'Borrar todos los clientes']
                ].map(([period, label]) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => handleBulkDeleteCustomers(period)}
                    disabled={Boolean(saving)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                      period === 'all'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'border border-red-200 bg-white text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {saving === `cleanup-${period}` ? 'Borrando...' : label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800">Uso recomendado</h3>
              <p className="mt-1 text-sm text-gray-500">
                Para aligerar la base de datos sin perder carreras en proceso, deja desmarcada la opción de pendientes/activas y borra por semana. Usa “todos” solo después de sacar reportes o cuando quieras limpiar completamente el histórico de clientes.
              </p>
            </section>
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

            <div className="space-y-3">
              {lines.length === 0 ? (
                <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-400">No hay líneas configuradas.</div>
              ) : lines.map(line => {
                const draft = lineDrafts[line.id] || line;
                return (
                  <div key={line.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_150px] gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          value={draft.label || ''}
                          onChange={e => setLineDrafts(current => ({
                            ...current,
                            [line.id]: { ...draft, label: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Nombre de línea"
                        />
                        <input
                          value={draft.display_phone_number || ''}
                          onChange={e => setLineDrafts(current => ({
                            ...current,
                            [line.id]: { ...draft, display_phone_number: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Celular visible"
                        />
                        <input
                          value={draft.phone_number_id || ''}
                          onChange={e => setLineDrafts(current => ({
                            ...current,
                            [line.id]: { ...draft, phone_number_id: e.target.value }
                          }))}
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Phone Number ID"
                        />
                      </div>
                      <div className="flex gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => handleUpdateLine(line)}
                          disabled={saving === `line-${line.id}`}
                          className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLine(line)}
                          disabled={saving === `delete-line-${line.id}`}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Desactivar
                        </button>
                      </div>
                    </div>
                    <label className="mt-3 flex w-fit items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.is_default)}
                        onChange={e => setLineDrafts(current => ({
                          ...current,
                          [line.id]: { ...draft, is_default: e.target.checked }
                        }))}
                      />
                      Línea principal
                    </label>
                  </div>
                );
              })}
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

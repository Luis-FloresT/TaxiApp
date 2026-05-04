import { useEffect, useState } from 'react';
import { createCustomerContacts, getChats } from '../services/api';
import socket from '../services/socket';

const rideLabels = {
  pending: 'Carrera pendiente',
  dispatched: 'Taxista asignado',
  accepted: 'Aceptada',
  en_route: 'En camino',
  picked_up: 'Recogido',
  completed: 'Finalizada',
  cancelled: 'Cancelada'
};

const ChatList = ({ onSelectChat, selectedChatId }) => {
  const [chats, setChats] = useState([]);
  const [filter, setFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [bulkContacts, setBulkContacts] = useState('');
  const [contactError, setContactError] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const pageSize = 80;

  useEffect(() => {
    let active = true;

    const loadChats = () => {
      getChats({ limit: pageSize, offset: 0 })
        .then(res => {
          if (!active) return;
          setHasMore(res.headers['x-has-more'] === 'true');
          setChats(res.data);
        })
        .catch(error => console.error('Error cargando chats:', error));
    };

    const handleNewMessage = () => loadChats(false);

    loadChats();
    socket.on('new_message', handleNewMessage);
    socket.on('message_sent', handleNewMessage);
    socket.on('chat_updated', handleNewMessage);
    socket.on('chat_deleted', handleNewMessage);
    window.addEventListener('chats:refresh', handleNewMessage);

    return () => {
      active = false;
      socket.off('new_message', handleNewMessage);
      socket.off('message_sent', handleNewMessage);
      socket.off('chat_updated', handleNewMessage);
      socket.off('chat_deleted', handleNewMessage);
      window.removeEventListener('chats:refresh', handleNewMessage);
    };
  }, []);

  const openChats = chats.filter(chat => chat.status !== 'closed');
  const visibleChats = chats.filter(chat => {
    if (filter === 'archived') return chat.status === 'closed';
    if (filter === 'drivers') return chat.contact_type === 'driver' && chat.status !== 'closed';
    if (filter === 'pending') return chat.status === 'pending' && chat.contact_type !== 'driver';
    if (filter === 'active') return chat.status === 'active' && chat.contact_type !== 'driver';
    return chat.status !== 'closed' && chat.contact_type !== 'driver';
  });

  const getStatusColor = (status) => {
    if (status === 'pending') return 'bg-yellow-400';
    if (status === 'active') return 'bg-green-400';
    return 'bg-gray-400';
  };

  const getStatusLabel = (status) => {
    if (status === 'pending') return 'Pendiente';
    if (status === 'active') return 'Activo';
    return 'Archivado';
  };

  const parseBulkContacts = () => {
    return bulkContacts
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split(/[,\t;]/).map(part => part.trim()).filter(Boolean);
        if (parts.length === 1) {
          return { phoneNumber: parts[0], name: '' };
        }

        return { name: parts[0], phoneNumber: parts.slice(1).join(' ') };
      });
  };

  const handleSaveContact = async (event) => {
    event.preventDefault();
    setContactError('');
    setSavingContact(true);

    const payload = bulkContacts.trim()
      ? { contacts: parseBulkContacts() }
      : { name: contactName, phoneNumber: contactPhone };

    try {
      const response = await createCustomerContacts(payload);
      const firstChat = response.data.chats?.[0];
      setContactName('');
      setContactPhone('');
      setBulkContacts('');
      setShowAddContact(false);
      window.dispatchEvent(new Event('chats:refresh'));
      if (firstChat) onSelectChat(firstChat);
    } catch (error) {
      const detail = error.response?.data?.errors?.[0]?.error || error.response?.data?.error;
      setContactError(detail || 'No se pudo guardar el cliente');
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header lista */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Chats</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddContact(true)}
              className="text-xs px-2 py-1 rounded-lg bg-white border border-green-200 text-green-700 hover:bg-green-50"
              title="Agregar cliente"
            >
              + Cliente
            </button>
            <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
              {openChats.length}
            </span>
          </div>
        </div>
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mt-2">
          {[
            ['all', 'Todos'],
            ['pending', 'Pendientes'],
            ['active', 'Activos'],
            ['drivers', 'Taxistas'],
            ['archived', 'Archivados']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={"text-xs px-2 py-1 rounded-full transition-colors " + (filter === value
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-green-100')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showAddContact && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveContact}
            className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-800">Agregar clientes</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Guarda contactos en el panel. Para escribirles por WhatsApp, Meta puede exigir que el cliente haya escrito primero.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <label className="text-sm text-gray-700">
                Nombre
                <input
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Luis Flores"
                  disabled={Boolean(bulkContacts.trim())}
                />
              </label>
              <label className="text-sm text-gray-700">
                WhatsApp
                <input
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="593969186861"
                  disabled={Boolean(bulkContacts.trim())}
                />
              </label>
            </div>

            <div className="mt-4">
              <label className="text-sm text-gray-700">
                Agregar varios
                <textarea
                  value={bulkContacts}
                  onChange={(event) => setBulkContacts(event.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-28 outline-none focus:ring-2 focus:ring-green-500"
                  placeholder={'Un cliente por línea:\nLuis Flores, 593969186861\nMaria Perez, 593987654321'}
                />
              </label>
              <p className="text-xs text-gray-400 mt-1">
                Puedes separar nombre y número con coma, punto y coma o tabulación.
              </p>
            </div>

            {contactError && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {contactError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingContact || (!bulkContacts.trim() && !contactPhone.trim())}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300"
              >
                {savingContact ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de chats */}
      <div className="flex-1 overflow-y-auto">
        {visibleChats.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <div className="text-4xl mb-2">💬</div>
            <p className="text-sm">Sin chats aún</p>
          </div>
        ) : (
          visibleChats.map(chat => (
            (() => {
              const idleMinutes = Number(chat.idle_minutes || 0);
              const isDriver = chat.contact_type === 'driver';
              const isManualContact = chat.manual_contact;
              const needsAttention = !isDriver && chat.status === 'pending' && idleMinutes >= 5;
              return (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors
                ${selectedChatId === chat.id ? 'bg-green-50 border-l-4 border-l-green-500' : ''}`}
            >
              {/* Avatar y nombre */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                  {chat.contact_name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-800 text-sm truncate">
                      {chat.contact_name || 'Desconocido'}
                    </p>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(chat.status)}`}></div>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    +{chat.phone_number}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {chat.last_message || 'Sin mensajes'}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {isDriver ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        Taxista
                      </span>
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {isManualContact ? 'Cliente guardado' : (rideLabels[chat.ride_status] || 'Carrera pendiente')}
                      </span>
                    )}
                    {needsAttention && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                        +5 min
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs px-2 py-0.5 rounded-full text-white ${isDriver ? 'bg-blue-500' : getStatusColor(chat.status)}`}>
                  {isDriver ? 'Taxista' : getStatusLabel(chat.status)}
                </span>
                {!isDriver && chat.assigned_driver_phone && (
                  <span
                    className="text-xs text-green-700 font-medium truncate max-w-[9rem]"
                    title={`${chat.assigned_driver_name || `+${chat.assigned_driver_phone}`}${chat.assigned_driver_vehicle_label ? ` · ${chat.assigned_driver_vehicle_label}` : ''}`}
                  >
                    🚕 Enviado a {chat.assigned_driver_name || `+${chat.assigned_driver_phone}`}
                  </span>
                )}
              </div>
            </div>
              );
            })()
          ))
        )}
        {hasMore && (
          <div className="p-3">
            <button
              type="button"
              onClick={() => {
                getChats({ limit: pageSize, offset: chats.length })
                  .then(res => {
                    setHasMore(res.headers['x-has-more'] === 'true');
                    setChats(current => [...current, ...res.data]);
                  })
                  .catch(error => console.error('Error cargando más chats:', error));
              }}
              className="w-full text-xs text-green-600 border border-green-100 rounded-lg py-2 hover:bg-green-50"
            >
              Cargar más chats
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatList;

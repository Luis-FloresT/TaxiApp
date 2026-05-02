import { useEffect, useState } from 'react';
import { getChats } from '../services/api';
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
    if (filter === 'pending') return chat.status === 'pending';
    if (filter === 'active') return chat.status === 'active';
    return chat.status !== 'closed';
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

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header lista */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Chats</h2>
          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
            {openChats.length}
          </span>
        </div>
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mt-2">
          {[
            ['all', 'Todos'],
            ['pending', 'Pendientes'],
            ['active', 'Activos'],
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
              const needsAttention = chat.status === 'pending' && idleMinutes >= 5;
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
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {rideLabels[chat.ride_status] || 'Carrera pendiente'}
                    </span>
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
                <span className={`text-xs px-2 py-0.5 rounded-full text-white ${getStatusColor(chat.status)}`}>
                  {getStatusLabel(chat.status)}
                </span>
                {chat.assigned_driver_phone && (
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

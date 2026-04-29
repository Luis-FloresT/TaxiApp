import { useEffect, useState, useRef } from 'react';
import { dispatchDriver, getDrivers, getMessages, sendMessage, toggleBot } from '../services/api';
import socket from '../services/socket';
import QuickReplies from './QuickReplies';

const ChatWindow = ({ chat }) => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [driverPhone, setDriverPhone] = useState(chat.assigned_driver_phone || '');
  const [driverName, setDriverName] = useState(chat.assigned_driver_name || '');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [assignedDriver, setAssignedDriver] = useState({
    phone: chat.assigned_driver_phone || '',
    name: chat.assigned_driver_name || '',
    vehicleLabel: chat.assigned_driver_vehicle_label || '',
    dispatchedAt: chat.driver_dispatched_at || ''
  });
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [saveDriver, setSaveDriver] = useState(true);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [sending, setSending] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [botActive, setBotActive] = useState(chat.bot_active ?? true);
  const bottomRef = useRef(null);

  useEffect(() => {
    let active = true;

    const reloadMessages = () => {
      getMessages(chat.id)
        .then(res => {
          if (active) setMessages(res.data);
        })
        .catch(error => console.error('Error cargando mensajes:', error));
    };

    Promise.all([getMessages(chat.id), getDrivers()])
      .then(([messagesRes, driversRes]) => {
        if (!active) return;
        setMessages(messagesRes.data);
        setDrivers(driversRes.data);
      })
      .catch(error => console.error('Error cargando chat:', error));

    const handleNewMessage = (data) => {
      if (data.chatId === chat.id) {
        reloadMessages();
      }
    };

    const handleMessageSent = (data) => {
      if (data.chatId === chat.id) reloadMessages();
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_sent', handleMessageSent);

    return () => {
      active = false;
      socket.off('new_message', handleNewMessage);
      socket.off('message_sent', handleMessageSent);
    };
  }, [chat.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendMessage(chat.phone_number, text, chat.id);
      setText('');
      const res = await getMessages(chat.id);
      setMessages(res.data);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      alert('Error enviando mensaje');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggleBot = async () => {
    const nextActive = !botActive;
    try {
      await toggleBot(chat.id, nextActive);
      setBotActive(nextActive);
    } catch (error) {
      console.error('Error cambiando bot:', error);
      alert('Error al cambiar estado del bot');
    }
  };

  const handleDriverSelect = (e) => {
    const nextDriverId = e.target.value;
    setSelectedDriverId(nextDriverId);

    if (!nextDriverId) {
      setDriverPhone('');
      setDriverName('');
      setVehicleLabel('');
      setSaveDriver(true);
      return;
    }

    const driver = drivers.find(item => String(item.id) === nextDriverId);
    setDriverPhone(driver?.phone_number || '');
    setDriverName(driver?.name || '');
    setVehicleLabel(driver?.vehicle_label || '');
    setSaveDriver(false);
  };

  const handleDispatch = async () => {
    if (!driverPhone.trim()) {
      alert('Ingresa el número del taxista');
      return;
    }

    setDispatching(true);
    try {
      const res = await dispatchDriver(chat.id, {
        driverId: selectedDriverId || null,
        driverPhone,
        driverName,
        vehicleLabel,
        notes: dispatchNotes,
        saveDriver
      });

      setAssignedDriver({
        phone: res.data.driver_phone || driverPhone.trim(),
        name: res.data.driver_name || driverName.trim(),
        vehicleLabel: res.data.driver_vehicle_label || vehicleLabel.trim(),
        dispatchedAt: res.data.driver_dispatched_at || new Date().toISOString()
      });
      setDispatchOpen(false);
      setDispatchNotes('');
      const [messagesRes, driversRes] = await Promise.all([
        getMessages(chat.id),
        getDrivers()
      ]);
      setDrivers(driversRes.data);
      setMessages(messagesRes.data);
      alert('Carrera enviada al taxista por WhatsApp');
    } catch (error) {
      console.error('Error despachando taxista:', error);
      alert(error.response?.data?.error || 'No se pudo despachar la carrera');
    } finally {
      setDispatching(false);
    }
  };

  const formatTime = (ts) => {
    return new Date(ts).toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const assignedDriverText = assignedDriver.name || (assignedDriver.phone ? `+${assignedDriver.phone}` : '');

  const isBotMessage = (content) =>
    content?.includes('TaxiWhatsApp') ||
    content?.includes('seleccione una opcion') ||
    content?.includes('seleccione una opción') ||
    content?.includes('Ubicacion recibida') ||
    content?.includes('Ubicación recibida') ||
    content?.includes('Direccion recibida') ||
    content?.includes('Dirección recibida') ||
    content?.includes('operador estara') ||
    content?.includes('operador estará') ||
    content?.includes('opcion') ||
    content?.includes('opción') ||
    content?.includes('Por favor');

  const getMapsUrl = (msg) => {
    if (msg.location_lat && msg.location_lng) {
      return "https://maps.google.com/?q=" + msg.location_lat + "," + msg.location_lng;
    }
    if (msg.content) {
      const match = (msg.content.match(/https:\/\/maps\.google\.com\/\?q=[\d.,-]+/) || []);
      return match[0] || null;
    }
    return null;
  };

  const renderMessageContent = (msg) => {
    const mapsUrl = getMapsUrl(msg);

    if (msg.message_type === 'location' || mapsUrl) {
      return (
        <div>
          <p className="text-sm whitespace-pre-line">{msg.content}</p>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 bg-white bg-opacity-20 rounded-lg px-3 py-2 text-xs hover:bg-opacity-30 transition-colors"
            >
              🗺️ Abrir en Google Maps
            </a>
          )}
        </div>
      );
    }

    return <p className="text-sm whitespace-pre-line">{msg.content}</p>;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">

      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold">
            {chat.contact_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{chat.contact_name || 'Desconocido'}</p>
            <p className="text-xs text-gray-500">+{chat.phone_number}</p>
            {assignedDriver.phone && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  🚕 Enviado a {assignedDriverText}
                </span>
                {assignedDriver.vehicleLabel && (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {assignedDriver.vehicleLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleBot}
            className={"flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors " + (botActive
              ? 'bg-blue-50 border-blue-300 text-blue-600 hover:bg-blue-100'
              : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100')}
          >
            {"🤖 " + (botActive ? 'Bot activo' : 'Bot inactivo')}
          </button>

          <button
            onClick={() => setDispatchOpen(!dispatchOpen)}
            className={"text-sm px-3 py-1.5 rounded-lg border transition-colors " + (dispatchOpen
              ? 'bg-green-500 text-white border-green-500'
              : 'bg-white text-green-600 border-green-300 hover:bg-green-50')}
          >
            🚕 Despachar taxista
          </button>
        </div>
      </div>

      {dispatchOpen && (
        <div className="bg-green-50 border-b border-green-100 px-6 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Taxista registrado
              </label>
              <select
                value={selectedDriverId}
                onChange={handleDriverSelect}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Escribir número manualmente</option>
                {drivers.map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} · +{driver.phone_number}{driver.vehicle_label ? ` · ${driver.vehicle_label}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                WhatsApp taxista
              </label>
              <input
                value={driverPhone}
                onChange={e => setDriverPhone(e.target.value)}
                disabled={Boolean(selectedDriverId)}
                placeholder="59399XXXXXXX"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nombre
              </label>
              <input
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
                disabled={Boolean(selectedDriverId)}
                placeholder="Ej: Carlos"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Unidad / placa
              </label>
              <input
                value={vehicleLabel}
                onChange={e => setVehicleLabel(e.target.value)}
                disabled={Boolean(selectedDriverId)}
                placeholder="Ej: Unidad 12"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notas al taxista
              </label>
              <input
                value={dispatchNotes}
                onChange={e => setDispatchNotes(e.target.value)}
                placeholder="Referencia o comentario"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 mt-3">
            <label className={"flex items-center gap-2 text-xs text-gray-600 " + (selectedDriverId ? 'opacity-50' : '')}>
              <input
                type="checkbox"
                checked={saveDriver}
                disabled={Boolean(selectedDriverId)}
                onChange={e => setSaveDriver(e.target.checked)}
              />
              Guardar este taxista en la lista
            </label>
            <button
              onClick={handleDispatch}
              disabled={dispatching}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {dispatching ? 'Enviando...' : 'Enviar carrera por WhatsApp'}
            </button>
          </div>
        </div>
      )}

      {botActive && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600 text-sm">
            <span className="animate-pulse">🤖</span>
            <span>El chatbot está atendiendo a este cliente automáticamente</span>
          </div>
          <button
            onClick={handleToggleBot}
            className="text-xs text-blue-500 hover:text-blue-700 underline"
          >
            Tomar control
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">💬</div>
              <p>Sin mensajes aún</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            if (msg.message_type === 'dispatch') {
              return (
                <div key={msg.id || `${msg.timestamp}-${i}`} className="flex justify-center">
                  <div className="max-w-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-center shadow-sm">
                    <p className="text-sm font-medium">{msg.content}</p>
                    <p className="text-xs mt-1 text-amber-600">
                      Nota interna · {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              );
            }

            const isBot = msg.from_agent && isBotMessage(msg.content);
            return (
              <div key={msg.id || `${msg.timestamp}-${i}`} className={"flex " + (msg.from_agent ? 'justify-end' : 'justify-start')}>
                {isBot && (
                  <div className="flex flex-col items-end gap-1 max-w-xs lg:max-w-md">
                    <span className="text-xs text-blue-400 mr-1">🤖 Bot</span>
                    <div className="bg-blue-500 text-white px-4 py-2 rounded-2xl rounded-br-sm shadow-sm">
                      {renderMessageContent(msg)}
                      <p className="text-xs mt-1 text-blue-100">
                        {formatTime(msg.timestamp)} ✓✓
                      </p>
                    </div>
                  </div>
                )}

                {msg.from_agent && !isBot && (
                  <div className="flex flex-col items-end gap-1 max-w-xs lg:max-w-md">
                    <span className="text-xs text-gray-400 mr-1">👤 Operador</span>
                    <div className="bg-green-500 text-white px-4 py-2 rounded-2xl rounded-br-sm shadow-sm">
                      {renderMessageContent(msg)}
                      <p className="text-xs mt-1 text-green-100">
                        {formatTime(msg.timestamp)} ✓✓
                      </p>
                    </div>
                  </div>
                )}

                {!msg.from_agent && (
                  <div className="max-w-xs lg:max-w-md">
                    <div className="bg-white text-gray-800 px-4 py-2 rounded-2xl rounded-bl-sm shadow-sm border border-gray-100">
                      {renderMessageContent(msg)}
                      <p className="text-xs mt-1 text-gray-400">
                        {formatTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t border-gray-200 p-4">
        {botActive && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 mb-3">
            <p className="text-xs text-yellow-700">
              ⚠️ El bot está activo. Si escribes, tomarás control automáticamente.
            </p>
          </div>
        )}

        <div className="relative">
          {showQuickReplies && (
            <QuickReplies
              onSelect={(msg) => setText(msg)}
              onClose={() => setShowQuickReplies(false)}
            />
          )}
          <div className="flex items-end gap-3">
            <button
              onClick={() => setShowQuickReplies(!showQuickReplies)}
              className={"p-2.5 rounded-xl border transition-colors flex-shrink-0 " + (showQuickReplies
                ? 'bg-green-500 text-white border-green-500'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
            >
              ⚡
            </button>
            <textarea
              value={text}
              onChange={e => {
                setText(e.target.value);
                if (botActive && e.target.value.length === 1) {
                  void handleToggleBot();
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={botActive ? 'Escribe para tomar control del chat...' : 'Escribe un mensaje... (Enter para enviar)'}
              rows={2}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center gap-2 flex-shrink-0"
            >
              {sending ? '...' : '➤ Enviar'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          ⚡ Respuestas rápidas &nbsp;•&nbsp; Enter para enviar &nbsp;•&nbsp; Shift+Enter nueva línea
        </p>
      </div>
    </div>
  );
};

export default ChatWindow;

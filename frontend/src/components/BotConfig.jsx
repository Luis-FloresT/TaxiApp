import { useEffect, useState } from 'react';
import {
  getBotMenu, updateBotMenuItem,
  addBotMenuItem, deleteBotMenuItem,
  getBotMessages, updateBotMessage
} from '../services/api';

const BotConfig = ({ onClose }) => {
  const [menu, setMenu] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('menu');
  const [editingItem, setEditingItem] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newItem, setNewItem] = useState({ option_text: '', response: '', goes_to_agent: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const loadData = async () => {
    const [menuRes, msgRes] = await Promise.all([
      getBotMenu(),
      getBotMessages()
    ]);
    setMenu(menuRes.data);
    setMessages(msgRes.data);
  };

  useEffect(() => {
    let active = true;

    Promise.all([getBotMenu(), getBotMessages()])
      .then(([menuRes, msgRes]) => {
        if (!active) return;
        setMenu(menuRes.data);
        setMessages(msgRes.data);
      })
      .catch(error => console.error('Error cargando configuración del bot:', error));

    return () => {
      active = false;
    };
  }, []);

  const showSaved = (text) => {
    setSaved(text);
    setTimeout(() => setSaved(''), 2000);
  };

  const handleSaveMenuItem = async (item) => {
    setSaving(true);
    await updateBotMenuItem(item.id, item);
    setEditingItem(null);
    await loadData();
    showSaved('Opción guardada');
    setSaving(false);
  };

  const handleAddItem = async () => {
    if (!newItem.option_text || !newItem.response) return;
    setSaving(true);
    await addBotMenuItem(newItem);
    setNewItem({ option_text: '', response: '', goes_to_agent: false });
    setShowNewForm(false);
    await loadData();
    showSaved('Opción agregada');
    setSaving(false);
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm('¿Eliminar esta opción?')) return;
    await deleteBotMenuItem(id);
    await loadData();
    showSaved('Opción eliminada');
  };

  const handleSaveMessage = async (msg) => {
    setSaving(true);
    await updateBotMessage(msg.key, msg.value);
    setEditingMsg(null);
    await loadData();
    showSaved('Mensaje guardado');
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-screen overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-blue-500 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h2 className="font-bold text-white">Configuración del Bot</h2>
              <p className="text-blue-100 text-sm">Personaliza mensajes y opciones del menú</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:text-blue-200 text-2xl">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('menu')}
            className={"flex-1 py-3 text-sm font-medium transition-colors " + (activeTab === 'menu'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700')}
          >
            📋 Opciones del menú
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={"flex-1 py-3 text-sm font-medium transition-colors " + (activeTab === 'messages'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700')}
          >
            💬 Mensajes del sistema
          </button>
        </div>

        {/* Saved toast */}
        {saved && (
          <div className="mx-6 mt-3 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-xl flex-shrink-0">
            ✅ {saved}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* TAB: Opciones del menú */}
          {activeTab === 'menu' && (
            <div className="space-y-3">
              {menu.map(item => (
                <div key={item.id} className={"border rounded-xl overflow-hidden " + (item.active ? 'border-gray-200' : 'border-gray-100 opacity-50')}>
                  {editingItem?.id === item.id ? (
                    <div className="p-4 space-y-3 bg-blue-50">
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Texto de la opción</label>
                        <input
                          value={editingItem.option_text}
                          onChange={e => setEditingItem({ ...editingItem, option_text: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Respuesta del bot</label>
                        <textarea
                          value={editingItem.response}
                          onChange={e => setEditingItem({ ...editingItem, response: e.target.value })}
                          rows={3}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={"agent_" + item.id}
                          checked={editingItem.goes_to_agent}
                          onChange={e => setEditingItem({ ...editingItem, goes_to_agent: e.target.checked })}
                          className="rounded"
                        />
                        <label htmlFor={"agent_" + item.id} className="text-sm text-gray-600">
                          Pasa al operador humano después de esta respuesta
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveMenuItem(editingItem)}
                          disabled={saving}
                          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium"
                        >
                          {saving ? 'Guardando...' : '💾 Guardar'}
                        </button>
                        <button
                          onClick={() => setEditingItem(null)}
                          className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                        {item.option_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-800 text-sm">{item.option_text}</p>
                          {item.goes_to_agent && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">→ Operador</span>
                          )}
                          {!item.active && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactivo</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{item.response}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => setEditingItem({ ...item })}
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >✏️</button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >🗑️</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Agregar nueva opción */}
              {showNewForm ? (
                <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
                  <p className="text-sm font-medium text-blue-700">Nueva opción</p>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Texto de la opción</label>
                    <input
                      value={newItem.option_text}
                      onChange={e => setNewItem({ ...newItem, option_text: e.target.value })}
                      placeholder="Ej: Reportar problema"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Respuesta del bot</label>
                    <textarea
                      value={newItem.response}
                      onChange={e => setNewItem({ ...newItem, response: e.target.value })}
                      placeholder="Ej: Por favor describa el problema..."
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="new_agent"
                      checked={newItem.goes_to_agent}
                      onChange={e => setNewItem({ ...newItem, goes_to_agent: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="new_agent" className="text-sm text-gray-600">
                      Pasa al operador humano
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddItem}
                      disabled={saving}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium"
                    >
                      {saving ? 'Agregando...' : '➕ Agregar'}
                    </button>
                    <button
                      onClick={() => setShowNewForm(false)}
                      className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewForm(true)}
                  className="w-full border-2 border-dashed border-gray-200 hover:border-blue-300 text-gray-400 hover:text-blue-500 py-3 rounded-xl text-sm transition-colors"
                >
                  ➕ Agregar nueva opción
                </button>
              )}
            </div>
          )}

          {/* TAB: Mensajes del sistema */}
          {activeTab === 'messages' && (
            <div className="space-y-3">
              {messages.map(msg => (
                <div key={msg.key} className="border border-gray-200 rounded-xl overflow-hidden">
                  {editingMsg?.key === msg.key ? (
                    <div className="p-4 space-y-3 bg-blue-50">
                      <p className="text-xs font-medium text-blue-600">{msg.description}</p>
                      <textarea
                        value={editingMsg.value}
                        onChange={e => setEditingMsg({ ...editingMsg, value: e.target.value })}
                        rows={5}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveMessage(editingMsg)}
                          disabled={saving}
                          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium"
                        >
                          {saving ? 'Guardando...' : '💾 Guardar'}
                        </button>
                        <button
                          onClick={() => setEditingMsg(null)}
                          className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-blue-600 mb-1">{msg.description}</p>
                        <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-3">{msg.value}</p>
                      </div>
                      <button
                        onClick={() => setEditingMsg({ ...msg })}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                      >✏️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BotConfig;

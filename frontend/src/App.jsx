import { useEffect, useState } from 'react';
import Header from './components/Header';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import Login from './components/Login';
import Simulator from './components/Simulator';
import BotConfig from './components/BotConfig';
import LegalPage from './components/LegalPage';
import DriversPanel from './components/DriversPanel';
import ReportsPanel from './components/ReportsPanel';
import MaintenancePanel from './components/MaintenancePanel';
import { getWhatsAppNumbers } from './services/api';

const lineStorageKey = (username) => `selectedWhatsappNumberId:${username || 'default'}`;

const readSavedAgent = () => {
  const savedAgent = localStorage.getItem('agent');
  const token = localStorage.getItem('token');

  if (!savedAgent || !token) return null;

  try {
    return JSON.parse(savedAgent);
  } catch {
    localStorage.removeItem('agent');
    localStorage.removeItem('token');
    return null;
  }
};

function App() {
  const simulatorEnabled = import.meta.env.VITE_ENABLE_SIMULATOR === 'true' || import.meta.env.DEV;
  const path = window.location.pathname;
  const [selectedChat, setSelectedChat] = useState(null);
  const [agent, setAgent] = useState(readSavedAgent);
  const [showBotConfig, setShowBotConfig] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [whatsappNumbers, setWhatsappNumbers] = useState([]);
  const [selectedWhatsappNumberId, setSelectedWhatsappNumberId] = useState(() => {
    const savedAgent = readSavedAgent();
    return (
      localStorage.getItem(lineStorageKey(savedAgent?.username)) ||
      localStorage.getItem('selectedWhatsappNumberId') ||
      'all'
    );
  });

  useEffect(() => {
    if (!agent) return;

    getWhatsAppNumbers()
      .then(res => {
        setWhatsappNumbers(res.data);
        if (selectedWhatsappNumberId !== 'all') {
          const exists = res.data.some(item => String(item.id) === String(selectedWhatsappNumberId));
          if (!exists) setSelectedWhatsappNumberId('all');
        }
      })
      .catch(error => console.error('Error cargando líneas de WhatsApp:', error));
  }, [agent, selectedWhatsappNumberId]);

  if (['/privacy', '/terms', '/data-deletion'].includes(path)) {
    return <LegalPage path={path} />;
  }

  if (path === '/simulator' && simulatorEnabled) {
    return <Simulator />;
  }

  const handleLogin = (agentData) => {
    setAgent(agentData);
    setSelectedWhatsappNumberId(
      localStorage.getItem(lineStorageKey(agentData.username)) ||
      localStorage.getItem('selectedWhatsappNumberId') ||
      'all'
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('agent');
    setAgent(null);
    setSelectedChat(null);
  };

  const handleWhatsappNumberChange = (value) => {
    setSelectedWhatsappNumberId(value);
    localStorage.setItem('selectedWhatsappNumberId', value);
    if (agent?.username) {
      localStorage.setItem(lineStorageKey(agent.username), value);
    }
    setSelectedChat(null);
    window.dispatchEvent(new Event('chats:refresh'));
  };

  const handleChatDeleted = (chatId) => {
    setSelectedChat(current => (current?.id === chatId ? null : current));
    window.dispatchEvent(new Event('chats:refresh'));
  };

  const handleBulkChatsDeleted = () => {
    setSelectedChat(null);
    window.dispatchEvent(new Event('chats:refresh'));
  };

  const handleChatUpdated = (chatData) => {
    setSelectedChat(current => (
      current?.id === chatData.id ? { ...current, ...chatData } : current
    ));
    window.dispatchEvent(new Event('chats:refresh'));
  };

  if (!agent) return <Login onLogin={handleLogin} />;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header
        agent={agent}
        onLogout={handleLogout}
        onBotConfig={agent.role === 'admin' ? () => setShowBotConfig(true) : null}
        onDrivers={() => setShowDrivers(true)}
        onReports={agent.role === 'admin' ? () => setShowReports(true) : null}
        onMaintenance={agent.role === 'admin' ? () => setShowMaintenance(true) : null}
        whatsappNumbers={whatsappNumbers}
        selectedWhatsappNumberId={selectedWhatsappNumberId}
        onWhatsappNumberChange={handleWhatsappNumberChange}
      />
      <div className="flex flex-1 overflow-hidden">
        <ChatList
          onSelectChat={setSelectedChat}
          selectedChatId={selectedChat?.id}
          selectedWhatsappNumberId={selectedWhatsappNumberId}
        />
        {selectedChat ? (
          <ChatWindow
            key={selectedChat.id}
            chat={selectedChat}
            agent={agent}
            onChatDeleted={handleChatDeleted}
            onChatUpdated={handleChatUpdated}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400">
              <div className="text-6xl mb-4">🚖</div>
              <h2 className="text-xl font-semibold text-gray-500">TaxiWhatsApp</h2>
              <p className="mt-2">Selecciona un chat para comenzar</p>
              {simulatorEnabled && (
                <a
                  href="/simulator"
                  className="mt-4 inline-block text-sm text-green-500 hover:underline"
                >
                  {'🧪 Abrir simulador de pruebas'}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
      {showBotConfig && (
        <BotConfig onClose={() => setShowBotConfig(false)} />
      )}
      {showDrivers && (
        <DriversPanel onClose={() => setShowDrivers(false)} />
      )}
      {showReports && (
        <ReportsPanel onClose={() => setShowReports(false)} />
      )}
      {showMaintenance && (
        <MaintenancePanel
          onClose={() => setShowMaintenance(false)}
          onBulkDeleted={handleBulkChatsDeleted}
        />
      )}
    </div>
  );
}

export default App;

import { useState } from 'react';
import Header from './components/Header';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import Login from './components/Login';
import Simulator from './components/Simulator';
import BotConfig from './components/BotConfig';
import LegalPage from './components/LegalPage';

function App() {
  const simulatorEnabled = import.meta.env.VITE_ENABLE_SIMULATOR === 'true' || import.meta.env.DEV;
  const path = window.location.pathname;
  const [selectedChat, setSelectedChat] = useState(null);
  const [agent, setAgent] = useState(() => {
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
  });
  const [showBotConfig, setShowBotConfig] = useState(false);

  if (['/privacy', '/terms', '/data-deletion'].includes(path)) {
    return <LegalPage path={path} />;
  }

  if (path === '/simulator' && simulatorEnabled) {
    return <Simulator />;
  }

  const handleLogin = (agentData) => setAgent(agentData);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('agent');
    setAgent(null);
    setSelectedChat(null);
  };

  const handleChatDeleted = (chatId) => {
    setSelectedChat(current => (current?.id === chatId ? null : current));
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
        onBotConfig={() => setShowBotConfig(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <ChatList
          onSelectChat={setSelectedChat}
          selectedChatId={selectedChat?.id}
        />
        {selectedChat ? (
          <ChatWindow
            key={selectedChat.id}
            chat={selectedChat}
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
    </div>
  );
}

export default App;

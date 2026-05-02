const Header = ({ agent, onLogout, onBotConfig, onDrivers, onReports }) => {
  return (
    <div className="bg-green-600 text-white px-6 py-4 flex items-center gap-3 shadow-md">
      <div className="text-2xl">🚖</div>
      <div>
        <h1 className="text-xl font-bold">TaxiWhatsApp</h1>
        <p className="text-green-100 text-sm">Panel de operadores</p>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
          <span className="text-sm text-green-100">En línea</span>
        </div>

        {onBotConfig && (
          <button
            onClick={onBotConfig}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            🤖 Configurar Bot
          </button>
        )}

        <button
          onClick={onDrivers}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-lg text-sm transition-colors"
        >
          🚕 Taxistas
        </button>

        {onReports && (
          <button
            onClick={onReports}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            📊 Reportes
          </button>
        )}

        {agent && (
          <div className="flex items-center gap-3 border-l border-green-500 pl-4">
            <div className="text-right">
              <p className="text-sm font-medium">{agent.name}</p>
              <p className="text-xs text-green-200">@{agent.username} · {agent.role === 'admin' ? 'Admin' : 'Operador'}</p>
            </div>
            <div className="w-8 h-8 bg-green-500 border-2 border-green-300 rounded-full flex items-center justify-center font-bold text-sm">
              {agent.name?.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={onLogout}
              className="text-xs bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;

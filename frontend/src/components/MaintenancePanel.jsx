import { useState } from 'react';
import { bulkDeleteCustomerChats } from '../services/api';

const MaintenancePanel = ({ onClose, onBulkDeleted }) => {
  const [includeOpenRides, setIncludeOpenRides] = useState(false);
  const [cleanupPeriod, setCleanupPeriod] = useState('');

  const handleBulkDelete = async (period) => {
    const label = period === 'today' ? 'hoy' : 'los últimos 7 días';
    const scopeText = includeOpenRides
      ? 'También se borrarán clientes pendientes y carreras activas.'
      : 'Solo se borrarán clientes finalizados o cancelados.';
    const ok = confirm(
      `¿Borrar chats de clientes de ${label}?\n\n${scopeText}\n\nLos chats de taxistas no se borrarán.`
    );

    if (!ok) return;

    setCleanupPeriod(period);
    try {
      const res = await bulkDeleteCustomerChats(period, includeOpenRides);
      onBulkDeleted?.();
      alert(`Limpieza completada. Chats borrados: ${res.data.deleted_count}`);
    } catch (error) {
      alert(error.response?.data?.error || 'No se pudieron borrar los chats');
    } finally {
      setCleanupPeriod('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-xl shadow-xl">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xl">
              🧹
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Mantenimiento</h2>
              <p className="text-sm text-gray-500">Limpieza segura de chats para mantener liviano el sistema.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          <section className="border border-red-100 bg-red-50 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-red-700">Borrar chats de clientes</h3>
                <p className="mt-1 text-sm text-red-700">
                  Por defecto solo elimina chats con carrera finalizada o cancelada. No elimina taxistas.
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

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleBulkDelete('today')}
                disabled={Boolean(cleanupPeriod)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
              >
                {cleanupPeriod === 'today' ? 'Borrando...' : 'Borrar clientes de hoy'}
              </button>
              <button
                type="button"
                onClick={() => handleBulkDelete('week')}
                disabled={Boolean(cleanupPeriod)}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {cleanupPeriod === 'week' ? 'Borrando...' : 'Borrar últimos 7 días'}
              </button>
            </div>
          </section>

          <section className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800">Recomendación</h3>
            <p className="mt-1 text-sm text-gray-500">
              Haz esta limpieza al final del turno o en horas tranquilas. Para operación diaria, usa primero finalizada/cancelada y luego borra.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePanel;

import { useEffect, useState } from 'react';
import { getReportSummary } from '../services/api';

const ReportsPanel = ({ onClose }) => {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    getReportSummary()
      .then(res => setSummary(res.data))
      .catch(error => console.error('Error cargando reportes:', error));
  }, []);

  const today = summary?.today || {};

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl shadow-xl">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Reportes</h2>
            <p className="text-sm text-gray-500">Resumen operativo para turno y administración.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>

        {!summary ? (
          <div className="p-8 text-center text-gray-400">Cargando reportes...</div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Chats nuevos hoy', today.new_chats_today],
                ['Despachos hoy', today.dispatched_today],
                ['Finalizadas hoy', today.completed_today],
                ['Canceladas hoy', today.cancelled_today]
              ].map(([label, value]) => (
                <div key={label} className="border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{value ?? 0}</p>
                </div>
              ))}
            </div>

            <section>
              <h3 className="font-semibold text-gray-800 mb-3">Estados abiertos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {summary.by_status.map(item => (
                  <div key={item.ride_status} className="border border-gray-200 rounded-lg p-3 flex justify-between">
                    <span className="text-sm text-gray-600">{item.ride_status}</span>
                    <span className="font-semibold">{item.total}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="font-semibold text-gray-800 mb-3">Taxistas con más despachos últimos 7 días</h3>
              <div className="divide-y border border-gray-200 rounded-lg">
                {summary.top_drivers_7d.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">Sin despachos recientes</div>
                ) : summary.top_drivers_7d.map(item => (
                  <div key={item.driver} className="p-3 flex justify-between text-sm">
                    <span>{item.driver}</span>
                    <span className="font-semibold">{item.total}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Tiempo promedio de primera respuesta</p>
              <p className="text-xl font-bold text-gray-800 mt-1">
                {summary.response.avg_first_response_minutes ?? 0} min
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPanel;

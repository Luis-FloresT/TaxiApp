import { useEffect, useState } from 'react';
import { createDriver, deleteDriver, getDrivers, updateDriver } from '../services/api';

const availabilityLabels = {
  available: 'Disponible',
  busy: 'Ocupado',
  offline: 'Fuera de turno'
};

const availabilityClasses = {
  available: 'bg-green-100 text-green-700',
  busy: 'bg-yellow-100 text-yellow-700',
  offline: 'bg-gray-100 text-gray-600'
};

const DriversPanel = ({ onClose }) => {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ name: '', phoneNumber: '', vehicleLabel: '' });
  const [loading, setLoading] = useState(false);

  const loadDrivers = () => {
    getDrivers()
      .then(res => setDrivers(res.data))
      .catch(error => console.error('Error cargando taxistas:', error));
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.phoneNumber.trim()) return;

    setLoading(true);
    try {
      await createDriver(form);
      setForm({ name: '', phoneNumber: '', vehicleLabel: '' });
      loadDrivers();
      window.dispatchEvent(new Event('chats:refresh'));
    } catch (error) {
      alert(error.response?.data?.error || 'No se pudo guardar el taxista');
    } finally {
      setLoading(false);
    }
  };

  const handleAvailability = async (driver, availabilityStatus) => {
    try {
      await updateDriver(driver.id, { availabilityStatus });
      loadDrivers();
    } catch (error) {
      alert(error.response?.data?.error || 'No se pudo actualizar el taxista');
    }
  };

  const handleDelete = async (driver) => {
    if (!confirm(`¿Desactivar a ${driver.name || driver.phone_number}?`)) return;

    try {
      await deleteDriver(driver.id);
      loadDrivers();
    } catch (error) {
      alert(error.response?.data?.error || 'No se pudo desactivar el taxista');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl shadow-xl flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Taxistas</h2>
            <p className="text-sm text-gray-500">Disponibilidad, unidad y contacto de despacho.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gray-50 border-b">
          <input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={form.phoneNumber}
            onChange={e => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="WhatsApp 593..."
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={form.vehicleLabel}
            onChange={e => setForm({ ...form, vehicleLabel: e.target.value })}
            placeholder="Unidad / placa"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            disabled={loading || !form.phoneNumber.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg px-3 py-2 text-sm font-medium"
          >
            Guardar taxista
          </button>
        </form>

        <div className="overflow-y-auto">
          {drivers.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Sin taxistas registrados</div>
          ) : (
            <div className="divide-y">
              {drivers.map(driver => (
                <div key={driver.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{driver.name || 'Sin nombre'}</p>
                    <p className="text-sm text-gray-500">+{driver.phone_number} {driver.vehicle_label ? `· ${driver.vehicle_label}` : ''}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${availabilityClasses[driver.availability_status] || availabilityClasses.offline}`}>
                    {availabilityLabels[driver.availability_status] || 'Sin estado'}
                  </span>
                  <select
                    value={driver.availability_status || 'available'}
                    onChange={e => handleAvailability(driver, e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="available">Disponible</option>
                    <option value="busy">Ocupado</option>
                    <option value="offline">Fuera de turno</option>
                  </select>
                  <button
                    onClick={() => handleDelete(driver)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Desactivar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriversPanel;

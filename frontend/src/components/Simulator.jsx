import { useState } from 'react';
import Header from './Header';
import { API_BASE_URL, simulateMessage } from '../services/api';

const quickMessages = [
  'Hola',
  '1',
  'Necesito un taxi en la av. Amazonas y Naciones Unidas',
  'operador',
  '2',
  'Desde La Carolina hasta Cumbayá'
];

export default function Simulator() {
  const [phone, setPhone] = useState('593992222222');
  const [name, setName] = useState('Test User');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [latitude, setLatitude] = useState('-0.180653');
  const [longitude, setLongitude] = useState('-78.467834');
  const [placeName, setPlaceName] = useState('La Carolina');
  const [address, setAddress] = useState('Parque La Carolina, Quito');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const payload = {
        phone,
        name,
        text: message,
        messageType
      };

      if (messageType === 'location') {
        payload.locationData = {
          latitude: Number(latitude),
          longitude: Number(longitude),
          name: placeName,
          address
        };
      }

      const res = await simulateMessage(payload);
      setResponse(res.data);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header />
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold mb-4">🧪 Simulador de WhatsApp</h1>
            <p className="text-sm text-gray-500 mb-4">
              Backend: {API_BASE_URL}
            </p>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="593992222222"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Nombre del usuario"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de mensaje
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMessageType('text')}
                    className={"px-4 py-2 rounded-md text-sm border transition " + (messageType === 'text'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50')}
                  >
                    Texto
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageType('location')}
                    className={"px-4 py-2 rounded-md text-sm border transition " + (messageType === 'location'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50')}
                  >
                    Ubicación
                  </button>
                </div>
              </div>

              {messageType === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mensaje
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows="6"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                    placeholder="Escribe el mensaje a simular..."
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {quickMessages.map(item => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => setMessage(item)}
                        className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-green-100"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Latitud
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Longitud
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lugar
                    </label>
                    <input
                      type="text"
                      value={placeName}
                      onChange={(e) => setPlaceName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !phone || (messageType === 'text' && !message.trim())}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-md transition"
              >
                {loading ? 'Enviando...' : 'Enviar Mensaje'}
              </button>
            </form>

            {error && (
              <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {response && (
              <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
                <p className="font-bold mb-2">✓ Mensaje enviado correctamente</p>
                <pre className="text-xs overflow-auto bg-white p-2 rounded border border-green-300">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getQuickReplies } from '../services/api';

const categoryColors = {
  saludo:      { bg: '#E1F5EE', text: '#0F6E56' },
  informacion: { bg: '#E6F1FB', text: '#185FA5' },
  confirmacion:{ bg: '#EAF3DE', text: '#3B6D11' },
  solicitud:   { bg: '#FAEEDA', text: '#854F0B' },
  despedida:   { bg: '#EEEDFE', text: '#534AB7' },
  general:     { bg: '#F1EFE8', text: '#5F5E5A' },
};

const categoryLabel = {
  saludo:       'Saludo',
  informacion:  'Información',
  confirmacion: 'Confirmación',
  solicitud:    'Solicitud',
  despedida:    'Despedida',
  general:      'General',
};

const QuickReplies = ({ onSelect, onClose }) => {
  const [replies, setReplies] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('todas');

  useEffect(() => {
    getQuickReplies().then(res => setReplies(res.data));
  }, []);

  const categories = ['todas', ...new Set(replies.map(r => r.category))];

  const filtered = replies.filter(r => {
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
                        r.message.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'todas' || r.category === activeCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden"
         style={{ maxHeight: '380px' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="font-medium text-gray-700 text-sm">Respuestas rápidas</p>
        <button onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {/* Buscador */}
      <div className="px-4 py-2 border-b border-gray-100">
        <input
          type="text"
          placeholder="Buscar respuesta..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
          autoFocus
        />
      </div>

      {/* Categorías */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-100">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors
              ${activeCategory === cat
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {cat === 'todas' ? 'Todas' : categoryLabel[cat] || cat}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            No se encontraron respuestas
          </div>
        ) : (
          filtered.map(reply => {
            const color = categoryColors[reply.category] || categoryColors.general;
            return (
              <div
                key={reply.id}
                onClick={() => { onSelect(reply.message); onClose(); }}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: color.bg, color: color.text }}>
                    {reply.title}
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{reply.message}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default QuickReplies;
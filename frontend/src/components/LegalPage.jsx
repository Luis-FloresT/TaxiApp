const legalContent = {
  '/privacy': {
    title: 'Política de privacidad',
    updated: 'Última actualización: 1 de mayo de 2026',
    sections: [
      {
        heading: 'Información que procesamos',
        body: 'TaxiWhatsApp procesa mensajes, números telefónicos, nombres de contacto, ubicaciones compartidas y datos operativos necesarios para gestionar solicitudes de taxi.'
      },
      {
        heading: 'Uso de la información',
        body: 'La información se usa para recibir solicitudes, coordinar operadores, asignar taxistas y mantener un historial operativo de atención.'
      },
      {
        heading: 'Conservación y seguridad',
        body: 'Los datos se conservan mientras sean necesarios para la operación del servicio. El acceso está limitado a usuarios autorizados del panel.'
      },
      {
        heading: 'Contacto',
        body: 'Para consultas de privacidad o eliminación de datos, escribe al correo de contacto registrado por el administrador de la aplicación.'
      }
    ]
  },
  '/terms': {
    title: 'Condiciones del servicio',
    updated: 'Última actualización: 1 de mayo de 2026',
    sections: [
      {
        heading: 'Uso del sistema',
        body: 'TaxiWhatsApp es una herramienta para gestionar conversaciones de WhatsApp, solicitudes de taxi y despacho de carreras.'
      },
      {
        heading: 'Responsabilidad operativa',
        body: 'La estación de taxis es responsable de verificar la disponibilidad, identidad y asignación de sus operadores y taxistas.'
      },
      {
        heading: 'Disponibilidad',
        body: 'El servicio depende de proveedores externos como WhatsApp Business Platform, hosting, base de datos e internet.'
      },
      {
        heading: 'Cambios',
        body: 'Estas condiciones pueden actualizarse para reflejar mejoras del sistema o requisitos legales.'
      }
    ]
  },
  '/data-deletion': {
    title: 'Eliminación de datos de usuario',
    updated: 'Última actualización: 1 de mayo de 2026',
    sections: [
      {
        heading: 'Cómo solicitar eliminación',
        body: 'Para solicitar eliminación de datos, contacta al administrador de TaxiWhatsApp con el número telefónico asociado a la conversación.'
      },
      {
        heading: 'Datos que se pueden eliminar',
        body: 'Se pueden eliminar conversaciones, mensajes, datos de contacto y ubicaciones asociadas al número solicitado, salvo información que deba conservarse por obligación operativa o legal.'
      },
      {
        heading: 'Tiempo de atención',
        body: 'Las solicitudes serán revisadas y atendidas en un plazo razonable una vez verificada la identidad o autorización del solicitante.'
      }
    ]
  }
};

const LegalPage = ({ path }) => {
  const content = legalContent[path] || legalContent['/privacy'];

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="text-sm text-green-600 hover:text-green-700">
          TaxiWhatsApp
        </a>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">{content.title}</h1>
        <p className="mt-2 text-sm text-gray-500">{content.updated}</p>

        <div className="mt-8 space-y-6">
          {content.sections.map(section => (
            <section key={section.heading} className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-lg font-semibold text-gray-900">{section.heading}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
};

export default LegalPage;

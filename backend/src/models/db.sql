CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(160),
  password VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(32) NOT NULL UNIQUE,
  contact_name VARCHAR(160),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'closed')),
  assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  assigned_driver_phone VARCHAR(32),
  assigned_driver_name VARCHAR(120),
  assigned_driver_vehicle_label VARCHAR(120),
  driver_dispatched_at TIMESTAMPTZ,
  bot_active BOOLEAN NOT NULL DEFAULT true,
  bot_step VARCHAR(80) NOT NULL DEFAULT 'welcome',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  from_agent BOOLEAN NOT NULL DEFAULT false,
  wa_message_id VARCHAR(160) UNIQUE,
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  location_lat NUMERIC(11, 8),
  location_lng NUMERIC(11, 8),
  location_name TEXT,
  location_address TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quick_replies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (title, category)
);

CREATE TABLE IF NOT EXISTS bot_menu (
  id SERIAL PRIMARY KEY,
  option_number INTEGER NOT NULL UNIQUE,
  option_text VARCHAR(180) NOT NULL,
  response TEXT NOT NULL,
  goes_to_agent BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_system_messages (
  key VARCHAR(80) PRIMARY KEY,
  value TEXT NOT NULL,
  description VARCHAR(220),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_contacts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone_number VARCHAR(32) NOT NULL UNIQUE,
  vehicle_label VARCHAR(120),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS name VARCHAR(120);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS username VARCHAR(80);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email VARCHAR(160);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE chats ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS contact_name VARCHAR(160);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'pending';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS assigned_agent_id INTEGER;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS assigned_driver_phone VARCHAR(32);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS assigned_driver_name VARCHAR(120);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS assigned_driver_vehicle_label VARCHAR(120);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS driver_dispatched_at TIMESTAMPTZ;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS bot_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS bot_step VARCHAR(80) NOT NULL DEFAULT 'welcome';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE chats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_agent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_message_id VARCHAR(160);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(32) NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_lat NUMERIC(11, 8);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_lng NUMERIC(11, 8);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_address TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS title VARCHAR(120);
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'general';
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bot_menu ADD COLUMN IF NOT EXISTS option_number INTEGER;
ALTER TABLE bot_menu ADD COLUMN IF NOT EXISTS option_text VARCHAR(180);
ALTER TABLE bot_menu ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE bot_menu ADD COLUMN IF NOT EXISTS goes_to_agent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bot_menu ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE bot_menu ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE bot_menu ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bot_system_messages ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE bot_system_messages ADD COLUMN IF NOT EXISTS description VARCHAR(220);
ALTER TABLE bot_system_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS name VARCHAR(120);
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS vehicle_label VARCHAR(120);
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_username_unique ON agents(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_phone_number_unique ON chats(phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_message_id_unique ON messages(wa_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_title_category_unique ON quick_replies(title, category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_menu_option_number_unique ON bot_menu(option_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_contacts_phone_unique ON driver_contacts(phone_number);

CREATE INDEX IF NOT EXISTS idx_chats_status ON chats(status);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_quick_replies_active_category ON quick_replies(active, category);
CREATE INDEX IF NOT EXISTS idx_bot_menu_active_option ON bot_menu(active, option_number);
CREATE INDEX IF NOT EXISTS idx_driver_contacts_active_name ON driver_contacts(active, name);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_agents_updated_at ON agents;
CREATE TRIGGER set_agents_updated_at
BEFORE UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_chats_updated_at ON chats;
CREATE TRIGGER set_chats_updated_at
BEFORE UPDATE ON chats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_quick_replies_updated_at ON quick_replies;
CREATE TRIGGER set_quick_replies_updated_at
BEFORE UPDATE ON quick_replies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_bot_menu_updated_at ON bot_menu;
CREATE TRIGGER set_bot_menu_updated_at
BEFORE UPDATE ON bot_menu
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_driver_contacts_updated_at ON driver_contacts;
CREATE TRIGGER set_driver_contacts_updated_at
BEFORE UPDATE ON driver_contacts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION touch_chat_from_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats SET updated_at = NEW.timestamp WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_chat_after_message ON messages;
CREATE TRIGGER touch_chat_after_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION touch_chat_from_message();

INSERT INTO agents (name, username, email, password, active)
VALUES
  ('Operador 1', 'operador1', 'operador1@taxiwhatsapp.local', '$2b$10$FMzeC/M2o/W.dBgbabZIIObKB6QjK1nC7YCZyhBOjEAIbnS0VcVye', true),
  ('Operador 2', 'operador2', 'operador2@taxiwhatsapp.local', '$2b$10$kTR0n0GZovrCSbfGQTFdzeIonF2kLvH1uxbnyDfZwgKt3I57hyv3G', true),
  ('Operador 3', 'operador3', 'operador3@taxiwhatsapp.local', '$2b$10$5k.2gzVFrtObkXm2YsgF..AS47a1tEn1/iTYOa0B7brzGVrG4pmIy', true)
ON CONFLICT (username) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  password = EXCLUDED.password,
  active = EXCLUDED.active;

INSERT INTO bot_system_messages (key, description, value)
VALUES
  (
    'welcome',
    'Mensaje inicial y menú principal',
    'Bienvenido a TaxiWhatsApp.

Por favor seleccione una opción:
1. Pedir taxi
2. Consultar tarifa
3. Verificar reserva
4. Horarios de atención

Responda con el número de la opción.'
  ),
  (
    'invalid_option',
    'Respuesta cuando el cliente envía una opción no válida',
    'Por favor responda con un número válido del menú.'
  ),
  (
    'agent_transfer',
    'Respuesta al transferir a un operador',
    'En un momento un operador estará con usted.'
  ),
  (
    'location_received',
    'Respuesta cuando el cliente comparte ubicación',
    'Ubicación recibida. Un operador confirmará su taxi en breve.'
  ),
  (
    'address_received',
    'Respuesta cuando el cliente escribe una dirección',
    'Dirección recibida. Un operador confirmará su taxi en breve.'
  )
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  value = EXCLUDED.value,
  updated_at = NOW();

INSERT INTO bot_menu (option_number, option_text, response, goes_to_agent, active)
VALUES
  (1, 'Pedir taxi', 'Indíquenos su dirección o comparta su ubicación para enviar un taxi.', false, true),
  (2, 'Consultar tarifa', 'Indíquenos origen y destino para calcular una tarifa aproximada.', false, true),
  (3, 'Verificar reserva', 'Envíenos el nombre o teléfono usado en la reserva para revisarla.', false, true),
  (4, 'Horarios de atención', 'Atendemos las 24 horas, todos los días.', false, true),
  (5, 'Hablar con operador', 'En un momento un operador estará con usted.', true, true)
ON CONFLICT (option_number) DO UPDATE SET
  option_text = EXCLUDED.option_text,
  response = EXCLUDED.response,
  goes_to_agent = EXCLUDED.goes_to_agent,
  active = EXCLUDED.active;

INSERT INTO quick_replies (title, category, message, active)
VALUES
  ('Saludo inicial', 'saludo', 'Hola, gracias por escribir a TaxiWhatsApp. ¿En qué podemos ayudarle?', true),
  ('Pedir dirección', 'solicitud', 'Por favor envíenos su dirección exacta o comparta su ubicación por WhatsApp.', true),
  ('Confirmar taxi', 'confirmacion', 'Su taxi está confirmado. Le avisaremos cuando el conductor esté cerca.', true),
  ('Tarifa aproximada', 'informacion', 'La tarifa aproximada depende del origen, destino y disponibilidad. Permítame revisarlo.', true),
  ('Sin unidades', 'informacion', 'Por el momento no tenemos unidades disponibles en su zona. Podemos avisarle apenas haya una.', true),
  ('Despedida', 'despedida', 'Gracias por comunicarse con TaxiWhatsApp. Que tenga un buen viaje.', true)
ON CONFLICT (title, category) DO UPDATE SET
  message = EXCLUDED.message,
  active = EXCLUDED.active;

INSERT INTO driver_contacts (name, phone_number, vehicle_label, active)
VALUES
  ('Taxi Carlos', '593987654321', 'Unidad 12', true),
  ('Taxi Luis', '593991234567', 'Unidad 18', true),
  ('Taxi Andrea', '593998765432', 'Unidad 24', true)
ON CONFLICT (phone_number) DO UPDATE SET
  name = EXCLUDED.name,
  vehicle_label = EXCLUDED.vehicle_label,
  active = EXCLUDED.active;

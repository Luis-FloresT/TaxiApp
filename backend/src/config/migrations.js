const pool = require('./db');
const { syncConfiguredWhatsAppNumbers } = require('../services/whatsappNumbers');

const ensureOperationalSchema = async () => {
  await pool.query(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS role VARCHAR(24) NOT NULL DEFAULT 'operator';

    CREATE TABLE IF NOT EXISTS whatsapp_numbers (
      id SERIAL PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      phone_number_id VARCHAR(120) NOT NULL UNIQUE,
      display_phone_number VARCHAR(32),
      access_token TEXT,
      is_default BOOLEAN NOT NULL DEFAULT false,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE chats ADD COLUMN IF NOT EXISTS ride_status VARCHAR(32) NOT NULL DEFAULT 'pending';
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS contact_type VARCHAR(24) NOT NULL DEFAULT 'customer';
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS related_client_chat_id INTEGER;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS whatsapp_number_id INTEGER REFERENCES whatsapp_numbers(id) ON DELETE SET NULL;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS line_key VARCHAR(120) NOT NULL DEFAULT 'default';
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS driver_accepted_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS driver_en_route_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS manual_contact BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS availability_status VARCHAR(24) NOT NULL DEFAULT 'available';
    ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_chats_ride_status ON chats(ride_status);
    CREATE INDEX IF NOT EXISTS idx_chats_contact_type ON chats(contact_type);
    CREATE INDEX IF NOT EXISTS idx_chats_assigned_driver_phone ON chats(assigned_driver_phone);
    CREATE INDEX IF NOT EXISTS idx_chats_related_client_chat ON chats(related_client_chat_id);
    CREATE INDEX IF NOT EXISTS idx_chats_whatsapp_number ON chats(whatsapp_number_id);
    CREATE INDEX IF NOT EXISTS idx_chats_line_key ON chats(line_key);
    CREATE INDEX IF NOT EXISTS idx_chats_manual_contact ON chats(manual_contact);
    CREATE INDEX IF NOT EXISTS idx_chats_open_updated_at ON chats(updated_at DESC) WHERE status <> 'closed';
    CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp_desc ON messages(chat_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_type_timestamp ON messages(chat_id, message_type, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_driver_contacts_availability ON driver_contacts(availability_status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_numbers_phone_id_unique ON whatsapp_numbers(phone_number_id);

    ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_phone_number_key;
    DROP INDEX IF EXISTS idx_chats_phone_number_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_phone_line_unique ON chats(phone_number, line_key);

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS set_whatsapp_numbers_updated_at ON whatsapp_numbers;
    CREATE TRIGGER set_whatsapp_numbers_updated_at
    BEFORE UPDATE ON whatsapp_numbers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    UPDATE agents SET role = 'admin' WHERE username = 'operador1' AND role = 'operator';

    UPDATE chats
    SET contact_type = 'driver',
        bot_active = false,
        bot_step = 'driver',
        status = CASE WHEN status = 'closed' THEN status ELSE 'active' END
    WHERE contact_type <> 'driver'
      AND (
        related_client_chat_id IS NOT NULL
        OR phone_number IN (SELECT phone_number FROM driver_contacts WHERE active = true)
      );

    UPDATE chats
    SET bot_active = false,
        bot_step = 'driver',
        status = CASE WHEN status = 'closed' THEN status ELSE 'active' END
    WHERE contact_type = 'driver';

    UPDATE chats
    SET ride_status = 'dispatched',
        status = CASE WHEN status = 'closed' THEN status ELSE 'active' END
    WHERE contact_type = 'customer'
      AND assigned_driver_phone IS NOT NULL
      AND ride_status = 'pending';

    INSERT INTO bot_system_messages (key, description, value)
    VALUES
      (
        'name_request',
        'Pregunta para guardar el nombre del cliente cuando no está registrado',
        '¿A nombre de quién solicita el taxi?'
      ),
      (
        'name_saved',
        'Confirmación después de guardar el nombre del cliente',
        'Gracias. Un operador confirmará su taxi en breve.'
      )
    ON CONFLICT (key) DO NOTHING;
  `);

  await syncConfiguredWhatsAppNumbers();
};

module.exports = { ensureOperationalSchema };

const pool = require('./db');

const ensureOperationalSchema = async () => {
  await pool.query(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS role VARCHAR(24) NOT NULL DEFAULT 'operator';

    ALTER TABLE chats ADD COLUMN IF NOT EXISTS ride_status VARCHAR(32) NOT NULL DEFAULT 'pending';
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS contact_type VARCHAR(24) NOT NULL DEFAULT 'customer';
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS related_client_chat_id INTEGER;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS driver_accepted_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS driver_en_route_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

    ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS availability_status VARCHAR(24) NOT NULL DEFAULT 'available';
    ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_chats_ride_status ON chats(ride_status);
    CREATE INDEX IF NOT EXISTS idx_chats_contact_type ON chats(contact_type);
    CREATE INDEX IF NOT EXISTS idx_chats_assigned_driver_phone ON chats(assigned_driver_phone);
    CREATE INDEX IF NOT EXISTS idx_chats_related_client_chat ON chats(related_client_chat_id);
    CREATE INDEX IF NOT EXISTS idx_chats_open_updated_at ON chats(updated_at DESC) WHERE status <> 'closed';
    CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp_desc ON messages(chat_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_type_timestamp ON messages(chat_id, message_type, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_driver_contacts_availability ON driver_contacts(availability_status);

    UPDATE agents SET role = 'admin' WHERE username = 'operador1' AND role = 'operator';

    UPDATE chats
    SET contact_type = 'driver',
        bot_active = false,
        bot_step = 'driver'
    WHERE contact_type <> 'driver'
      AND (
        related_client_chat_id IS NOT NULL
        OR phone_number IN (SELECT phone_number FROM driver_contacts WHERE active = true)
      );
  `);
};

module.exports = { ensureOperationalSchema };

const pool = require('./db');

const ensureOperationalSchema = async () => {
  await pool.query(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS role VARCHAR(24) NOT NULL DEFAULT 'operator';

    ALTER TABLE chats ADD COLUMN IF NOT EXISTS ride_status VARCHAR(32) NOT NULL DEFAULT 'pending';
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS related_client_chat_id INTEGER;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS driver_accepted_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS driver_en_route_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

    ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS availability_status VARCHAR(24) NOT NULL DEFAULT 'available';
    ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_chats_ride_status ON chats(ride_status);
    CREATE INDEX IF NOT EXISTS idx_chats_assigned_driver_phone ON chats(assigned_driver_phone);
    CREATE INDEX IF NOT EXISTS idx_chats_related_client_chat ON chats(related_client_chat_id);
    CREATE INDEX IF NOT EXISTS idx_driver_contacts_availability ON driver_contacts(availability_status);

    UPDATE agents SET role = 'admin' WHERE username = 'operador1' AND role = 'operator';
  `);
};

module.exports = { ensureOperationalSchema };

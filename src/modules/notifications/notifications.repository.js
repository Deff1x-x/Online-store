import { query } from '../../config/db.js';

export const insertNotification = async ({
  channel,
  recipient,
  templateKey,
  payload,
}) => {
  const result = await query(
    `INSERT INTO notification_queue (
       channel,
       recipient,
       template_key,
       payload,
       status,
       scheduled_at
     )
     VALUES ($1, $2, $3, $4::jsonb, 'pending', NOW())
     RETURNING *`,
    [channel, recipient, templateKey, JSON.stringify(payload || {})],
  );

  return result.rows[0];
};

export const findDeliverySettingsForStore = async (client, storeId) => {
  const result = await client.query(
    `SELECT
       id,
       store_id,
       min_order_value_for_free_delivery,
       delivery_fee
     FROM delivery_settings
     WHERE store_id = $1
     LIMIT 1`,
    [storeId],
  );

  return result.rows[0] || null;
};

import { pool } from '../../config/db.js';

const allowedOrderStatuses = ['new', 'picked', 'in_delivery', 'delivered', 'canceled'];
const onlinePaymentDiscountRate = 0.05;

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const getOperatorStoreId = (request) => {
  return request.user?.store_id;
};

export const getOperatorOrders = async (request, response) => {
  const operatorStoreId = getOperatorStoreId(request);
  const { status } = request.query;

  if (!operatorStoreId) {
    return response.status(403).json({
      message: 'Operator must be assigned to a store',
    });
  }

  if (status && !allowedOrderStatuses.includes(status)) {
    return response.status(400).json({
      message: 'Invalid order status filter',
    });
  }

  try {
    const queryParams = [operatorStoreId];
    let statusFilter = '';

    if (status) {
      queryParams.push(status);
      statusFilter = 'AND orders.status = $2';
    }

    const result = await pool.query(
      `SELECT
         orders.id,
         orders.store_id,
         orders.customer_id,
         orders.status,
         orders.payment_method,
         orders.total_price,
         orders.created_at,
         users.name AS customer_name,
         users.phone AS customer_phone,
         COUNT(order_items.id)::INT AS items_count
       FROM orders
       INNER JOIN users ON users.id = orders.customer_id
       LEFT JOIN order_items ON order_items.order_id = orders.id
       WHERE orders.store_id = $1
       ${statusFilter}
       GROUP BY orders.id, users.name, users.phone
       ORDER BY orders.created_at DESC`,
      queryParams,
    );

    return response.status(200).json({
      orders: result.rows,
    });
  } catch (error) {
    console.error('Get operator orders error:', error);
    return response.status(500).json({
      message: 'Failed to fetch operator orders',
    });
  }
};

export const pickOrder = async (request, response) => {
  const { id } = request.params;
  const { items } = request.body;
  const operatorStoreId = getOperatorStoreId(request);

  if (!operatorStoreId) {
    return response.status(403).json({
      message: 'Operator must be assigned to a store',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return response.status(400).json({
      message: 'Picked order items are required',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, store_id, payment_method, status
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return response.status(404).json({
        message: 'Order was not found',
      });
    }

    const order = orderResult.rows[0];

    if (order.store_id !== operatorStoreId) {
      await client.query('ROLLBACK');
      return response.status(403).json({
        message: 'Operator can only manage orders from their assigned store',
      });
    }

    for (const item of items) {
      const { item_id, actual_weight } = item;
      const parsedActualWeight = Number(actual_weight);

      if (!item_id || !Number.isFinite(parsedActualWeight) || parsedActualWeight <= 0) {
        await client.query('ROLLBACK');
        return response.status(400).json({
          message: 'Each picked item must include item_id and a positive actual_weight',
        });
      }

      const updateResult = await client.query(
        `UPDATE order_items
         SET actual_weight = $1
         WHERE id = $2 AND order_id = $3
         RETURNING id`,
        [parsedActualWeight, item_id, order.id],
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return response.status(404).json({
          message: `Order item ${item_id} was not found in this order`,
        });
      }
    }

    const orderItemsResult = await client.query(
      `SELECT
         order_items.id,
         order_items.quantity,
         order_items.estimated_weight,
         order_items.actual_weight,
         order_items.price_per_unit,
         products.is_weighted
       FROM order_items
       INNER JOIN products ON products.id = order_items.product_id
       WHERE order_items.order_id = $1`,
      [order.id],
    );

    let recalculatedTotalPrice = 0;

    for (const orderItem of orderItemsResult.rows) {
      const pricePerUnit = Number(orderItem.price_per_unit);

      if (orderItem.is_weighted) {
        if (!orderItem.actual_weight) {
          await client.query('ROLLBACK');
          return response.status(400).json({
            message: `Weighted order item ${orderItem.id} requires actual_weight before picking`,
          });
        }

        recalculatedTotalPrice += Number(orderItem.actual_weight) * pricePerUnit;
      } else {
        recalculatedTotalPrice += Number(orderItem.quantity) * pricePerUnit;
      }
    }

    if (order.payment_method === 'online') {
      recalculatedTotalPrice -= recalculatedTotalPrice * onlinePaymentDiscountRate;
    }

    const finalTotalPrice = roundMoney(recalculatedTotalPrice);

    const pickedOrderResult = await client.query(
      `UPDATE orders
       SET status = 'picked',
           total_price = $1
       WHERE id = $2
       RETURNING id, store_id, customer_id, status, payment_method, total_price, created_at`,
      [finalTotalPrice, order.id],
    );

    await client.query('COMMIT');

    return response.status(200).json({
      message: 'Order picked successfully',
      order: pickedOrderResult.rows[0],
      items: orderItemsResult.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Pick order error:', error);
    return response.status(500).json({
      message: 'Failed to pick order',
    });
  } finally {
    client.release();
  }
};

import { pool } from '../../config/db.js';

const onlinePaymentDiscountRate = 0.05;

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

export const createOrder = async (request, response) => {
  const { payment_method, items } = request.body;
  const customerId = request.user?.id;

  if (!customerId) {
    return response.status(401).json({
      message: 'Authenticated customer is required',
    });
  }

  if (!['online', 'pos'].includes(payment_method)) {
    return response.status(400).json({
      message: 'payment_method must be either online or pos',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return response.status(400).json({
      message: 'Order items are required',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      `SELECT id, store_id, role
       FROM users
       WHERE id = $1 AND role = 'Customer'`,
      [customerId],
    );

    if (customerResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return response.status(403).json({
        message: 'Only customers can create orders',
      });
    }

    const customer = customerResult.rows[0];

    const subscriptionResult = await client.query(
      `SELECT id
       FROM subscriptions
       WHERE user_id = $1
         AND store_id = $2
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [customer.id, customer.store_id],
    );

    if (subscriptionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return response.status(403).json({
        message: 'Active subscription is required to create an order',
      });
    }

    const orderItems = [];
    let totalPrice = 0;

    for (const item of items) {
      const { product_id, quantity } = item;
      const parsedQuantity = Number(quantity);

      if (!product_id || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        await client.query('ROLLBACK');
        return response.status(400).json({
          message: 'Each item must include product_id and a positive integer quantity',
        });
      }

      const productResult = await client.query(
        `SELECT
           products.id,
           products.price_per_unit,
           products.is_weighted,
           products.average_weight,
           store_inventory.stock_quantity,
           store_inventory.is_visible
         FROM products
         INNER JOIN store_inventory ON store_inventory.product_id = products.id
         WHERE products.id = $1
           AND store_inventory.store_id = $2
         LIMIT 1`,
        [product_id, customer.store_id],
      );

      if (productResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return response.status(404).json({
          message: `Product ${product_id} is not available in the customer's store`,
        });
      }

      const product = productResult.rows[0];

      if (!product.is_visible || product.stock_quantity < parsedQuantity) {
        await client.query('ROLLBACK');
        return response.status(400).json({
          message: `Product ${product_id} is not visible or does not have enough stock`,
        });
      }

      const pricePerUnit = Number(product.price_per_unit);
      let estimatedWeight = null;
      let itemTotalPrice = 0;

      if (product.is_weighted) {
        if (!product.average_weight) {
          await client.query('ROLLBACK');
          return response.status(400).json({
            message: `Weighted product ${product_id} does not have average_weight configured`,
          });
        }

        /*
         * Weighted products are ordered by package count, but sold by weight.
         * At order time we do not know the real picked weight yet, so we estimate it:
         * estimated_weight = average package weight * requested quantity.
         * The operator will later fill actual_weight during picking, and the item price
         * can then be recalculated from actual_weight * price_per_unit.
         */
        estimatedWeight = Number(product.average_weight) * parsedQuantity;
        itemTotalPrice = estimatedWeight * pricePerUnit;
      } else {
        /*
         * Non-weighted products are priced by unit count.
         * For them estimated_weight and actual_weight stay NULL.
         */
        itemTotalPrice = parsedQuantity * pricePerUnit;
      }

      totalPrice += itemTotalPrice;

      orderItems.push({
        product_id,
        quantity: parsedQuantity,
        estimated_weight: estimatedWeight,
        price_per_unit: pricePerUnit,
      });
    }

    if (payment_method === 'online') {
      totalPrice -= totalPrice * onlinePaymentDiscountRate;
    }

    const finalTotalPrice = roundMoney(totalPrice);

    const orderResult = await client.query(
      `INSERT INTO orders (store_id, customer_id, payment_method, total_price)
       VALUES ($1, $2, $3, $4)
       RETURNING id, store_id, customer_id, status, payment_method, total_price, created_at`,
      [customer.store_id, customer.id, payment_method, finalTotalPrice],
    );

    const order = orderResult.rows[0];

    for (const orderItem of orderItems) {
      await client.query(
        `INSERT INTO order_items (
           order_id,
           product_id,
           quantity,
           estimated_weight,
           actual_weight,
           price_per_unit
         )
         VALUES ($1, $2, $3, $4, NULL, $5)`,
        [
          order.id,
          orderItem.product_id,
          orderItem.quantity,
          orderItem.estimated_weight,
          orderItem.price_per_unit,
        ],
      );
    }

    await client.query('COMMIT');

    return response.status(201).json({
      message: 'Order created successfully',
      order: {
        ...order,
        items: orderItems,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create order error:', error);
    return response.status(500).json({
      message: 'Failed to create order',
    });
  } finally {
    client.release();
  }
};

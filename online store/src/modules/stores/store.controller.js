import { query } from '../../config/db.js';

export const adminCreateStore = async (request, response) => {
  const { name, address } = request.body;

  if (!name || !address) {
    return response.status(400).json({
      message: 'Store name and address are required',
    });
  }

  try {
    const result = await query(
      `INSERT INTO stores (name, address, status, settings)
       VALUES ($1, $2, 'active', '{}'::JSONB)
       RETURNING id, name, address, status, settings`,
      [name, address],
    );

    return response.status(201).json({
      message: 'Store created successfully',
      store: result.rows[0],
    });
  } catch (error) {
    console.error('Create store error:', error);
    return response.status(500).json({
      message: 'Failed to create store',
    });
  }
};

export const getStores = async (request, response) => {
  try {
    const result = await query(
      `SELECT id, name, address, status
       FROM stores
       WHERE status = 'active'
       ORDER BY name ASC`,
    );

    return response.status(200).json({
      stores: result.rows,
    });
  } catch (error) {
    console.error('Get stores error:', error);
    return response.status(500).json({
      message: 'Failed to fetch stores',
    });
  }
};

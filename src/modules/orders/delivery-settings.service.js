import { AppError } from '../../utils/errors.js';
import { findDeliverySettingsForStore } from './delivery-settings.repository.js';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const calculateDeliveryFee = async (client, { storeId, subtotal }) => {
  const settings = await findDeliverySettingsForStore(client, storeId);

  if (!settings) {
    throw new AppError(
      500,
      'Delivery settings are not configured for this store.',
      'delivery_settings_not_configured',
    );
  }

  if (
    settings.min_order_value_for_free_delivery === null
    || settings.min_order_value_for_free_delivery === undefined
    || settings.delivery_fee === null
    || settings.delivery_fee === undefined
  ) {
    throw new AppError(
      500,
      'Delivery settings are not configured for this store.',
      'delivery_settings_not_configured',
    );
  }

  const threshold = Number(settings.min_order_value_for_free_delivery);
  const fee = Number(settings.delivery_fee);

  if (!Number.isFinite(threshold) || !Number.isFinite(fee)) {
    throw new AppError(
      500,
      'Delivery settings are not configured for this store.',
      'delivery_settings_not_configured',
    );
  }

  if (subtotal < threshold) {
    return {
      deliveryFee: roundMoney(fee),
      settings,
    };
  }

  return {
    deliveryFee: 0,
    settings,
  };
};

import { AppError } from '../../utils/errors.js';
import {
  createStore as createStoreRepository,
  findActiveStores,
} from './store.repository.js';

export const createStore = async ({ name, address }) => {
  if (!name || !address) {
    throw new AppError(400, 'Store name and address are required', 'store_required_fields');
  }

  const store = await createStoreRepository({ name, address });

  return {
    message: 'Store created successfully',
    store,
  };
};

export const getStores = async () => {
  const stores = await findActiveStores();

  return { stores };
};

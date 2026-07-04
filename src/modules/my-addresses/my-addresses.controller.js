import { sendControllerError } from '../../utils/http.js';
import {
  createAddress as createAddressService,
  deleteAddress as deleteAddressService,
  listAddresses,
} from './my-addresses.service.js';

export const getAddresses = async (request, response) => {
  try {
    const result = await listAddresses({ user: request.user });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch addresses');
  }
};

export const createAddress = async (request, response) => {
  try {
    const result = await createAddressService({ user: request.user, body: request.body });
    return response.status(201).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to create address');
  }
};

export const deleteAddress = async (request, response) => {
  try {
    const result = await deleteAddressService({ user: request.user, addressId: request.params.id });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to delete address');
  }
};

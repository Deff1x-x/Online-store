import {
  createAddress as createAddressService,
  deleteAddress as deleteAddressService,
  listAddresses,
} from './my-addresses.service.js';

const handle = (action, status = 200) => async (request, response, next) => {
  try {
    return response.status(status).json(await action(request));
  } catch (error) {
    return next(error);
  }
};

export const getAddresses = handle((request) => listAddresses({ user: request.user }));
export const createAddress = handle((request) => createAddressService({
  user: request.user,
  body: request.body || {},
}), 201);
export const deleteAddress = handle((request) => deleteAddressService({
  user: request.user,
  addressId: request.params.id,
}));

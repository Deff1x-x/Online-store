import {
  getProfile as getProfileService,
  updateProfile as updateProfileService,
} from './my-profile.service.js';

const handle = (action) => async (request, response, next) => {
  try {
    return response.status(200).json(await action(request));
  } catch (error) {
    return next(error);
  }
};

export const getProfile = handle((request) => getProfileService({ user: request.user }));
export const updateProfile = handle((request) => updateProfileService({
  user: request.user,
  body: request.body || {},
}));

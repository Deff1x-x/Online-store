import { sendControllerError } from '../../utils/http.js';
import {
  getProfile as getProfileService,
  updateProfile as updateProfileService,
} from './my-profile.service.js';

export const getProfile = async (request, response) => {
  try {
    const result = await getProfileService({ user: request.user });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch profile');
  }
};

export const updateProfile = async (request, response) => {
  try {
    const result = await updateProfileService({ user: request.user, body: request.body });
    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to update profile');
  }
};

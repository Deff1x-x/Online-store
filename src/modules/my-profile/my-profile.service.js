import { AppError } from '../../utils/AppError.js';
import * as repository from './my-profile.repository.js';

const requireProfile = (profile) => {
  if (!profile) {
    throw new AppError(404, 'Customer profile was not found', 'profile_not_found');
  }

  return profile;
};

export const getProfile = async ({ user }) => {
  const profile = requireProfile(await repository.findProfileByUserId(user.id));
  return { profile };
};

export const updateProfile = async ({ user, body }) => {
  const fields = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    fields.name = body.name === null ? null : String(body.name).trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    const email = body.email === null ? null : String(body.email).trim();
    fields.email = email || null;
  }

  await repository.updateProfileForUser({
    userId: user.id,
    fields,
  });

  const profile = requireProfile(await repository.findProfileByUserId(user.id));
  return { profile };
};

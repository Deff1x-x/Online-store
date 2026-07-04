import { sendControllerError } from '../../utils/http.js';
import { getActiveStoreCoverage } from './store-coverage.service.js';

export const getStoreCoverage = async (request, response) => {
  try {
    const result = await getActiveStoreCoverage({
      user: request.user,
      storeId: request.params.store_id,
    });

    return response.status(200).json(result);
  } catch (error) {
    return sendControllerError(response, error, 'Failed to fetch store coverage');
  }
};

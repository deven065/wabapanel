const sendResponse = (res, statusCode, data, message = 'Success') => {
  return res.status(statusCode).json({
    success: statusCode < 400,
    message,
    data,
  });
};

const sendError = (res, statusCode, message = 'Error') => {
  return res.status(statusCode).json({
    success: false,
    message,
  });
};

const sendPaginated = (res, data, total, page, limit) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  });
};

module.exports = { sendResponse, sendError, sendPaginated };

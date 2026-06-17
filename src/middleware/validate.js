export const validate = (schema, where = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[where], { abortEarly: false, stripUnknown: true });
  if (error) {
    return next({ status: 400, code: 'VALIDATION', message: error.message });
  }
  req[where] = value;
  next();
};

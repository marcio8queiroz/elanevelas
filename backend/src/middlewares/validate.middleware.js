import AppError from '../utils/AppError.js';

export default function validate(schemas) {
  return (req, res, next) => {
    void res;
    const validated = {};

    for (const location of ['body', 'params', 'query']) {
      if (!schemas[location]) continue;
      const result = schemas[location].safeParse(req[location]);
      if (!result.success) {
        const message = result.error.issues
          .map((issue) => `${issue.path.join('.') || location}: ${issue.message}`)
          .join('; ');
        return next(new AppError(`Dados inválidos: ${message}`, 400));
      }
      validated[location] = result.data;
    }

    req.validated = { ...req.validated, ...validated };
    return next();
  };
}

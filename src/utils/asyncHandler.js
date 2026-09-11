// Express 4 vangt geen promise-rejections uit async route-handlers automatisch op —
// zonder deze wrapper zou een databasefout een verzoek laten "hangen" in plaats van
// een nette foutmelding terug te geven. Elke route wordt hiermee omwikkeld.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };

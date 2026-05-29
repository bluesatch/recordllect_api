const router = require('express').Router()
const auth = require('../../middleware/auth')
const csvImportController = require('../../controllers/csvImportController')

router.post('/import', auth, csvImportController.importFromCSV)

module.exports = router
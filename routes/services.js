
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const Service = require('../models/Service');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// @route   GET api/services
// @desc    Get all services
// @access  Public
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().sort({ price: 1 });
    res.json(services);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/services/:id
// @desc    Get service by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json(service);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   POST api/services
// @desc    Create a service
// @access  Private/Admin
router.post(
  '/',
  [
    auth,
    admin,
    [
      check('name', 'Name is required').not().isEmpty(),
      check('description', 'Description is required').not().isEmpty(),
      check('price', 'Price must be a positive number').isFloat({ min: 0 }),
      check('duration', 'Duration must be a positive number').isInt({ min: 5 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, price, duration, isActive, loyaltyPointsEarned } = req.body;

    try {
      const newService = new Service({
        name,
        description,
        price,
        duration,
        isActive: isActive !== undefined ? isActive : true,
        loyaltyPointsEarned: loyaltyPointsEarned || 0
      });

      const service = await newService.save();

      res.json(service);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   PUT api/services/:id
// @desc    Update a service
// @access  Private/Admin
router.put(
  '/:id',
  [
    auth,
    admin,
    [
      check('name', 'Name is required').not().isEmpty(),
      check('description', 'Description is required').not().isEmpty(),
      check('price', 'Price must be a positive number').isFloat({ min: 0 }),
      check('duration', 'Duration must be a positive number').isInt({ min: 5 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, price, duration, isActive, loyaltyPointsEarned } = req.body;

    try {
      let service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }

      service.name = name;
      service.description = description;
      service.price = price;
      service.duration = duration;
      service.isActive = isActive !== undefined ? isActive : service.isActive;
      service.loyaltyPointsEarned = loyaltyPointsEarned !== undefined ? loyaltyPointsEarned : service.loyaltyPointsEarned;
      service.updatedAt = Date.now();

      await service.save();

      res.json(service);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Service not found' });
      }
      res.status(500).send('Server error');
    }
  }
);

// @route   DELETE api/services/:id
// @desc    Delete a service
// @access  Private/Admin
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    await service.deleteOne();

    res.json({ message: 'Service removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;

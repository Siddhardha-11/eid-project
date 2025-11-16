const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
// --- THIS IS THE ONLY CHANGE ---
const PORT = process.env.PORT || 3000; // Use Render's port, or 3000 for local
// --- END OF CHANGE ---

// --- CONFIGURATION ---
const MONGO_URI = 'mongodb+srv://cs24b012_db_user:tranquility%40123@storage-e-id.joof12t.mongodb.net/eidDatabase?appName=storage-e-id';

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- DATABASE MODEL ---
const userSchema = new mongoose.Schema({
    eId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true },
    phone: { type: String, required: true, unique: true, index: true },
    address: { type: String, required: true },
    issued: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// --- API ROUTES ---

/**
 * @route   POST /api/register
 */
app.post('/api/register', async (req, res) => {
    try {
        const { name, dob, gender, phone, address } = req.body;

        const existingUser = await User.findOne({ phone: phone });
        if (existingUser) {
            console.log('Registration failed: Phone number already in use.');
            return res.status(409).json({ message: 'User already registered with this phone number.' });
        }

        let newEId = '';
        let isUnique = false;
        while (!isUnique) {
            newEId = String(Math.floor(100000000000 + Math.random() * 900000000000));
            const idExists = await User.findOne({ eId: newEId });
            if (!idExists) {
                isUnique = true;
            }
        }

        const newUser = new User({
            eId: newEId,
            name,
            dob,
            gender,
            phone,
            address,
            issued: new Date()
        });

        await newUser.save();
        console.log('New user registered:', newUser);
        res.status(201).json(newUser);

    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 11000) {
             return res.status(409).json({ message: 'A user with this phone number or E-ID already exists.' });
        }
        res.status(500).json({ message: 'Server error during registration.', error: error.message });
    }
});

/**
 * @route   GET /api/search/:eId
 */
app.get('/api/search/:eId', async (req, res) => {
    try {
        const eIdToFind = req.params.eId;

        if (!eIdToFind || eIdToFind.length !== 12 || !/^\d+$/.test(eIdToFind)) {
            return res.status(400).json({ message: 'Invalid E-ID format. Must be 12 digits.' });
        }

        const user = await User.findOne({ eId: eIdToFind });

        if (!user) {
            console.log(`Search failed: E-ID ${eIdToFind} not found.`);
            return res.status(404).json({ message: 'No E-ID record found for this number.' });
        }

        console.log('User found:', user);
        res.status(200).json(user);

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Server error during search.', error: error.message });
    }
});

/**
 * @route   PUT /api/update
 */
app.put('/api/update', async (req, res) => {
    try {
        const { eId, name, phone, address } = req.body;

        if (!eId) {
            return res.status(400).json({ message: 'E-ID is required for updates.' });
        }

        const user = await User.findOne({ eId: eId });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const updates = {};
        if (name) updates.name = name;
        if (address) updates.address = address;

        if (phone && phone !== user.phone) {
            const existingUser = await User.findOne({ phone: phone });
            if (existingUser) {
                return res.status(409).json({ message: 'This phone number is already registered to another user.' });
            }
            updates.phone = phone;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided for update.' });
        }

        const updatedUser = await User.findOneAndUpdate(
            { eId: eId },
            { $set: updates },
            { new: true }
        );

        console.log('User updated:', updatedUser);
        res.status(200).json(updatedUser);

    } catch (error) {
        console.error('Update error:', error);
        if (error.code === 11000) {
             return res.status(409).json({ message: 'This phone number is already registered to another user.' });
        }
        res.status(500).json({ message: 'Server error during update.', error: error.message });
    }
});


// --- DATABASE CONNECTION & SERVER START ---
console.log("Connecting to MongoDB...");
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB!');
        
        // Start the Express server
        app.listen(PORT, () => {
            console.log(`Server is running on port: ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1); // Exit the app if DB connection fails
    });

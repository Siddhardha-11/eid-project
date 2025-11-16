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
```

**2. Push Your `eid-backend` to GitHub:**

Render needs to read your code from a repository.
1.  Go to [GitHub](https://github.com/) and create a **new, private repository** (e.g., `eid-backend`).
2.  In your terminal, `cd` into your `eid-backend` folder.
3.  Run these commands to push your code:
    ```bash
    git init
    git add .
    git commit -m "Prepare for Render deployment"
    git branch -M main
    git remote add origin https://github.com/your-username/eid-backend.git
    git push -u origin main
    ```

---

### Phase 2: Deploy the Backend on Render

1.  Go to **[Render.com](https://render.com/)**, log in with your GitHub account.
2.  Click **New+** -> **Web Service**.
3.  Connect the `eid-backend` repository you just created.
4.  Fill in the settings:
    * **Name:** `eid-backend` (or any name you like)
    * **Branch:** `main`
    * **Start Command:** `npm start`
    * **Instance Type:** **Free**
5.  Click **"Create Web Service"**.
6.  **Wait!** This will take 5-10 minutes. It will install `npm`, run `npm start`, and then say "Your service is live."
7.  Once it's live, **copy your new public URL** from the top of the Render dashboard. It will look like this:
    `https://eid-backend-123.onrender.com`

---

### Phase 3: The CRITICAL Final Step (Connecting Everything)

Now you have a public frontend and a public backend, but they don't know about each other.

**Step 1: Whitelist Render's IP in MongoDB (CRITICAL)**

1.  Go to your **MongoDB Atlas** dashboard.
2.  On the left, click **"Network Access"**.
3.  Click **"Add IP Address"**.
4.  Click **"ALLOW ACCESS FROM ANYWHERE"** (this adds `0.0.0.0/0`).
5.  Click **"Confirm"**. This is *required* because your Render server's IP address can change.



**Step 2: Update Your *Frontend* on Netlify**

1.  On your **local computer**, open your `trail.html` file (or `index.html`, whichever you uploaded to Netlify) in a text editor.
2.  Go to the `<script>` tag at the very bottom.
3.  Find this line:
    ```javascript
    const API_URL = 'http://localhost:3000/api';
    ```
4.  **Change it** to your new public Render URL:
    ```javascript
    const API_URL = 'https://eid-backend-123.onrender.com/api';

const express = require('express');
const app = express();
app.use(express.json());
require('dotenv').config();
// cors is needed to allow cross-origin requests
const cors = require('cors');
app.use(cors());


// Set up Firebase Admin SDK
const admin = require('firebase-admin');
const serviceAccount = {
  "type": "service_account",
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID.replace(/\\n/gm, "\n"),
  "private_key": process.env.FIREBASE_PRIVATE_KEY,
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": process.env.FIREBASE_AUTH_URI,
  "token_uri": process.env.FIREBASE_TOKEN_URI,
  "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL,
  "universe_domain": process.env.FIREBASE_UNIVERSE_DOMAIN,
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Set up Firestore
const db = admin.firestore();

const DEFAULT_DURATION = 90;

// Example route to fetch data from Firestore
app.get('/api/schedule/:type', async (req, res) => {
  // log api request
  const type = req.params.type;
  const getRaw = req.query.raw;
  console.log(`GET /api/schedule/${type}`);
  try {
    const collectionRef = db.collection('schedule');

    // Fetch 'schedule' document
    const scheduleDoc = await collectionRef.doc(type.trim().toLowerCase()).get();
    const schedule = scheduleDoc.exists ? scheduleDoc.data() : null;

    if (getRaw) {
      res.status(200).json(schedule);
      return;
    }

    // Fetch 'users' document
    const usersDoc = await collectionRef.doc('users').get();
    const users = usersDoc.exists ? usersDoc.data() : null;

    // Map user names to schedule data for all dates
    const mappedSchedule = {};
    Object.keys(schedule).forEach(day => {
      mappedSchedule[day] = {};
      Object.keys(schedule[day]).forEach(userId => {
        const userData = users[userId];
        if (userData) {
          mappedSchedule[day][userData.name] = {
            time: schedule[day][userId].time,
            court: schedule[day][userId].court,
            duration: schedule[day][userId]?.duration || DEFAULT_DURATION
          };
        }
      });
    });

    res.status(200).json(mappedSchedule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST endpoint to update schedule data
app.post('/api/schedule/:type', async (req, res) => {
  const type = req.params.type;

  const { day, user, time, court, duration } = req.body;

  if (!day || !user || !time || !court) {
    res.status(400).json({ error: 'Invalid request' });
  }

  // ensure day is all lower case expect first letter
  const dayLower = day.trim().toLowerCase();
  const dayLowerFirst = dayLower.charAt(0).toUpperCase() + dayLower.slice(1);

  try {
    const docRef = db.collection('schedule').doc(type.trim().toLowerCase());
    const doc = await docRef.get();
    const scheduleData = doc.exists ? doc.data() : {};


    // Check if the day exists, create it if it doesn't
    if (!scheduleData[dayLowerFirst]) {
      scheduleData[dayLowerFirst] = {};
    }

    // Update the user's schedule data
    scheduleData[dayLowerFirst][user] = { time, court, duration };

    // Set the updated data in Firestore
    await docRef.set(scheduleData);

    res.json({ data: scheduleData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE endpoint to delete user's data for a specific day
app.delete('/api/schedule/:type', async (req, res) => {
  const type = req.params.type;
  const { day, user } = req.body;

  if (!day || !user) {
    res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const docRef = db.collection('schedule').doc(type.trim().toLowerCase());
    const doc = await docRef.get();
    const scheduleData = doc.exists ? doc.data() : {};

    // Check if the day and user exist before attempting deletion
    if (scheduleData[day] && scheduleData[day][user]) {
      // Delete the user's data for the specified day
      delete scheduleData[day][user];

      // Check if the day has no remaining users, delete the day
      if (Object.keys(scheduleData[day]).length === 0) {
        delete scheduleData[day];
      }

      // Update the Firestore document with the modified schedule data
      await docRef.set(scheduleData);

      res.json({ success: true, message: 'User schedule deleted successfully' });
    } else {
      res.status(404).json({ error: 'User or day not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// get users
app.get('/api/users', async (req, res) => {
  console.log('GET /api/users');
  try {
    const docRef = db.collection('schedule').doc('users');
    const doc = await docRef.get();
    const users = doc.exists ? doc.data() : null;
    // return it as an array of objects
    const usersArray = Object.keys(users).map(key => {
      return { id: key, ...users[key] };
    });
    res.status(200).json(usersArray);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// get tennis or pickleball configurations
app.get('/api/configurations/:type', async (req, res) => {
  const type = req.params.type;
  console.log(`GET /api/configurations/${type}`); // log api request
  try {
    const doc = await db.collection('configurations').doc(`${type}`).get();
    const config = doc.exists ? doc.data() : null;

    res.status(200).json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Add to database
/*
app.post('/api/configurations', async (req, res) => {
  const docRef = db.collection('collectionName').doc('documentName');
  const data = {};
  docRef.set(data);
  res.status(500).json({ error: 'Completed POST req' });
});
*/

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// Export the Express API
module.exports = app;
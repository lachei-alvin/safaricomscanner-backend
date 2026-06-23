const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET;
const SHORTCODE = "4904538"; // Sandbox shortcode
const PASSKEY =
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const BASE_URL = "https://api.safaricom.co.ke'";

// Get access token
async function getToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString(
    "base64",
  );
  const res = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
    },
  );
  return res.data.access_token;
}

// STK Push endpoint
app.post("/stk-push", async (req, res) => {
  try {
    const { phone, amount, planName } = req.body;

    const token = await getToken();
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14);
    const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString(
      "base64",
    );

    // Normalize phone number to 254 format
    let normalizedPhone = phone.replace(/\s/g, "");
    if (normalizedPhone.startsWith("0"))
      normalizedPhone = "254" + normalizedPhone.slice(1);
    if (normalizedPhone.startsWith("+"))
      normalizedPhone = normalizedPhone.slice(1);

    const payload = {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: normalizedPhone,
      PartyB: SHORTCODE,
      PhoneNumber: normalizedPhone,
      CallBackURL: "https://webhook.site/your-unique-url", // temp for testing
      AccountReference: "SafaricomScanner",
      TransactionDesc: `${planName} Subscription`,
    };

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error(err?.response?.data ?? err.message);
    res
      .status(500)
      .json({ success: false, error: err?.response?.data ?? err.message });
  }
});

// STK Push status check
app.post("/stk-status", async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    const token = await getToken();
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14);
    const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString(
      "base64",
    );

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, error: err?.response?.data ?? err.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));

// Admin panel
const path = require('path');
const { initializeApp: initAdmin, cert, getApps } = require('firebase-admin/app');
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
const crypto = require('crypto');
const serviceAccount = require('./serviceAccountKey.json');

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : serviceAccount;
  initAdmin({ credential: cert(sa) });
}
const adminDb = getAdminFirestore();

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/generate-tokens', async (req, res) => {
  try {
    const {duration, count} = req.body;
    const daysMap = {'1day': 1, '7days': 7, '30days': 30};
    if (!daysMap[duration]) throw new Error('Invalid duration');
    const tokens = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      await adminDb.collection('tokens').doc(code).set({
        code, duration,
        daysGranted: daysMap[duration],
        used: false,
        createdAt: Date.now(),
      });
      tokens.push(code);
    }
    res.json({success: true, tokens});
  } catch (e) {
    res.status(500).json({success: false, error: e.message});
  }
});

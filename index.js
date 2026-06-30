const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const {
  initializeApp: initAdmin,
  cert,
  getApps,
} = require("firebase-admin/app");
const { getFirestore: getAdminFirestore } = require("firebase-admin/firestore");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MEGAPAY CONFIGURATION ---
const MEGAPAY_API_KEY = process.env.MEGAPAY_API_KEY;
const MEGAPAY_EMAIL = process.env.MEGAPAY_EMAIL;
const MEGAPAY_BASE_URL = "https://megapay.co.ke/backend";

// --- FIREBASE SETUP ---
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require("./serviceAccountKey.json");

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : serviceAccount;
  initAdmin({ credential: cert(sa) });
}
const adminDb = getAdminFirestore();

// --- MPESA STK PUSH (Via MegaPay) ---
app.post("/stk-push", async (req, res) => {
  try {
    const { phone, amount, planName } = req.body;

    // Normalize phone number to 254XXXXXXXXX format
    let normalizedPhone = phone.replace(/\s/g, "");
    if (normalizedPhone.startsWith("0"))
      normalizedPhone = "254" + normalizedPhone.slice(1);
    if (normalizedPhone.startsWith("+"))
      normalizedPhone = normalizedPhone.slice(1);

    const payload = {
      api_key: MEGAPAY_API_KEY,
      email: MEGAPAY_EMAIL,
      amount: amount,
      msisdn: normalizedPhone,
      reference: `SUB-${planName.replace(/\s+/g, "-")}`, // Clean reference identifier
    };

    const response = await axios.post(
      `${MEGAPAY_BASE_URL}/v1/initiatestk`,
      payload,
    );

    // Forward MegaPay response directly back to the React Native app
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error(err?.response?.data ?? err.message);
    res
      .status(500)
      .json({ success: false, error: err?.response?.data ?? err.message });
  }
});

// --- MPESA STATUS CHECK (Via MegaPay) ---
app.post("/stk-status", async (req, res) => {
  try {
    const { checkoutRequestId } = req.body; // Pass the request ID returned during initiation

    const payload = {
      api_key: MEGAPAY_API_KEY,
      email: MEGAPAY_EMAIL,
      transaction_request_id: checkoutRequestId,
    };

    const response = await axios.post(
      `${MEGAPAY_BASE_URL}/v1/transactionstatus`,
      payload,
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, error: err?.response?.data ?? err.message });
  }
});

// --- MEGAPAY CALLBACK WEBHOOK ---
// Make sure this route is fully public and not protected by custom authorization middlewares!
app.post("/api/safaricomscanner/callback", async (req, res) => {
  try {
    const data = req.body;
    console.log("Incoming Payment Callback:", data);

    const responseCode = data.ResponseCode;
    const checkoutRequestId = data.CheckoutRequestID;
    const amount = data.TransactionAmount;

    // ResponseCode 0 means successful transaction completion
    if (responseCode === 0) {
      console.log(
        `Payment confirmed for request ${checkoutRequestId}. Amount: KES ${amount}`,
      );

      // OPTIONAL: Automatically generate a subscription token right here in Firestore
      // for the user when the callback succeeds.
    }

    // Always acknowledge MegaPay quickly with a 200 OK so they don't loop retries
    res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Callback handling error:", error);
    res.status(500).json({ status: "error" });
  }
});

// --- ADMIN PANEL & TOKEN GENERATION ---
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.post("/generate-tokens", async (req, res) => {
  try {
    const { duration, count } = req.body;
    const daysMap = { "1day": 1, "7days": 7, "30days": 30 };
    if (!daysMap[duration]) throw new Error("Invalid duration");
    const tokens = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      await adminDb.collection("tokens").doc(code).set({
        code,
        duration,
        daysGranted: daysMap[duration],
        used: false,
        createdAt: Date.now(),
      });
      tokens.push(code);
    }
    res.json({ success: true, tokens });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));

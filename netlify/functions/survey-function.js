// netlify/functions/survey.js
// Receives survey responses and writes them to Google Sheets.
//
// SETUP (do this once):
// 1. Go to console.cloud.google.com
// 2. Create a new project → enable "Google Sheets API"
// 3. Create a Service Account → download the JSON key file
// 4. Open your Google Sheet → Share it with the service account email
// 5. In Netlify dashboard → Site settings → Environment variables, add:
//      GOOGLE_SERVICE_ACCOUNT_EMAIL  = the service account email from the JSON
//      GOOGLE_PRIVATE_KEY            = the private_key value from the JSON (include \n characters)
//      GOOGLE_SHEET_ID               = the long ID from your sheet URL
//                                      e.g. docs.google.com/spreadsheets/d/[THIS_PART]/edit
//
// The sheet mtcksss.global@gmail.com owns it — share the service account email as Editor.

const { google } = require("googleapis");

// Column headers written on the very first row (only if sheet is empty)
const HEADERS = [
  "Timestamp",
  "Are you a KSSS student?",
  "Were you aware of the MTC before?",
  "How did you find this site?",
  "Did you know the club builds real software?",
  "Have you followed the Math Quiz Competition?",
  "How interested are you in joining?",
  "What would you most like to see from the club?",
];

exports.handler = async function (event) {
  // Handle preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  let answers;
  try {
    answers = JSON.parse(event.body);
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }

  // Validate — all 7 answers must be present and non-empty strings
  if (
    !Array.isArray(answers) ||
    answers.length !== 7 ||
    answers.some((a) => typeof a !== "string" || a.trim() === "")
  ) {
    return respond(400, { error: "All 7 answers are required" });
  }

  // Authenticate with Google
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;

  try {
    // Check if the sheet has any rows — if not, write the header row first
    const meta = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A1:A1",
    });
    const hasHeaders =
      meta.data.values && meta.data.values.length > 0;

    if (!hasHeaders) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      });
    }

    // Append the response row
    const row = [new Date().toISOString(), ...answers];
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });

    return respond(200, { success: true });
  } catch (err) {
    console.error("Sheets API error:", err.message);
    return respond(500, { error: "Failed to save response" });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

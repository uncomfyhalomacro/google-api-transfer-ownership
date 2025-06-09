const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const readline = require("node:readline");

// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive",
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    // console.log(credentials);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    console.error(err);
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  console.log("No credentials before stored.");
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    console.log("Saving creds.");
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: "nextPageToken, files(id, name, owners)",
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  console.log("Files:");
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
    const owners = file.owners;
    if (owners.length === 0) {
      console.log("No owners?");
    }
    owners.map((owner) => {
      console.log(`${owner.permissionId}`);
    });
  });
}

async function transferOwnership(authClient) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: "nextPageToken, files(id, name, owners)",
  });
  const files = res.data.files;

  let targetFile;
  let permission;
  let result;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question(`What's the filename?\n`, (filename) => {
    targetFile = files.find((file) => file.name === filename);
    if (targetFile) {
      console.log(`${targetFile.name} (${targetFile.id})`);
      rl.close();
    } else {
      console.error("File not found.");
    }
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl2.question("Transfer to whom?\n", (targetOwner) => {
      permission = {
        type: "user",
        role: "writer",
        emailAddress: targetOwner,
        pendingOwner: true,
      };
      result = drive.permissions.create({
        emailMessage: "sending you this file",
        sendNotificationEmail: true,
        moveToNewOwnersRoot: true,
        fileId: targetFile.id,
        requestBody: permission,
        transferOwnership: false,
      });
      rl2.close();
    });
    rl.close();
  });
  const awaitedResult = await result;
  console.log(awaitedResult);
}

// authorize().then(listFiles).catch(console.error);
authorize().then(transferOwnership).catch(console.error);

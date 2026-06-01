import { google } from 'googleapis';
import { Readable } from 'stream';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const creds = JSON.parse(
    raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  );
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

/**
 * Find or create a nested subfolder path under the root Drive folder.
 * e.g. "bookings/ClientName" → creates bookings/ then ClientName/ inside it.
 */
async function ensureFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  pathParts: string[]
): Promise<string> {
  let currentParent = parentId;
  for (const name of pathParts) {
    const q = `'${currentParent}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
    if (res.data.files?.length) {
      currentParent = res.data.files[0].id!;
    } else {
      const created = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentParent],
        },
        fields: 'id',
      });
      currentParent = created.data.id!;
    }
  }
  return currentParent;
}

/**
 * Upload a file buffer to Google Drive inside a subfolder.
 * @param buffer  - file contents
 * @param fileName - e.g. "bookings_ClientName_2026-05-18.xlsx"
 * @param subfolder - slash-separated path, e.g. "bookings/ClientName"
 * @returns Google Drive file ID
 */
export async function uploadToDrive(
  buffer: Buffer,
  fileName: string,
  subfolder: string
): Promise<string> {
  if (!FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  const parts = subfolder.split('/').filter(Boolean);
  const folderId = parts.length
    ? await ensureFolder(drive, FOLDER_ID, parts)
    : FOLDER_ID;

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: Readable.from(buffer),
    },
    fields: 'id',
  });

  return res.data.id!;
}

# Spreadsheet Artifacts - Implementation Summary

## Current Implementation: S3-Only Architecture ✅

### Overview

Excel spreadsheet artifacts are fully implemented with a simple S3-only architecture. Users can create, view, edit, and version Excel files through chat conversations. Files are stored in AWS S3 with user ownership validated via S3 key patterns (`users/{userId}/spreadsheets/{artifactId}.xlsx`). **No metadata database is required.**

### Architecture Benefits

- ✅ **Simple deployment** - Only S3 configuration needed
- ✅ **Built-in versioning** - S3 native version control
- ✅ **Secure access** - Presigned URLs with JWT validation
- ✅ **No database migrations** - Zero database overhead
- ✅ **Production ready** - Both backend and frontend complete

---

## What's Implemented

### 1. Core Services (Backend)

#### S3Service (`api/server/services/Spreadsheet/S3Service.js`)

Handles all file storage operations with AWS S3:
- Upload Excel files with automatic versioning
- Download specific versions
- List all versions with metadata
- Generate presigned URLs for secure downloads (1-hour expiry)
- Restore previous versions (copy as new latest)
- Delete versions or entire artifacts
- Check if versioning is enabled on bucket

**Key Methods:**
- `uploadSpreadsheet(userId, artifactId, buffer, metadata)` - Upload with S3 native versioning
- `downloadSpreadsheet(s3Key, versionId)` - Fetch specific version
- `listVersions(s3Key)` - Get all versions from S3 API
- `getPresignedUrl(s3Key, versionId, expirySeconds)` - Generate time-limited download URLs
- `restoreVersion(s3Key, versionId)` - Rollback to previous version
- `deleteAllVersions(s3Key)` - Remove all versions of an artifact

**S3 Key Pattern:**
```
users/{userId}/spreadsheets/{artifactId}.xlsx
```

#### ExcelService (`api/server/services/Spreadsheet/ExcelService.js`)

Handles Excel file generation and parsing using ExcelJS:
- Create Excel workbooks from headers + rows data
- Parse existing Excel files to extract data
- Update existing workbooks
- List sheets in a workbook
- Validate Excel file structure
- Auto-format columns, freeze headers, apply borders

**Key Methods:**
- `createWorkbook(headers, rows, options)` - Generate .xlsx from data
- `parseWorkbook(buffer, options)` - Extract headers/rows from .xlsx
- `updateWorkbook(workbook, sheetName, headers, rows)` - Modify existing file
- `toBuffer(workbook)` - Convert workbook to uploadable buffer
- `listSheets(workbook)` - Get all worksheet names

**Parse Output Structure:**
```javascript
{
  headers: ['Name', 'Age', 'City'],
  rows: [
    ['Alice', 30, 'NYC'],
    ['Bob', 25, 'LA']
  ],
  metadata: {
    sheetCount: 1,
    totalRows: 2
  }
}
```

### 2. API Routes (`api/server/routes/spreadsheet-artifact.js`)

All routes require JWT authentication via `requireJwtAuth` middleware. Routes validate user ownership by checking that the s3Key starts with `users/{userId}/spreadsheets/`.

| Method | Endpoint | Description | Requires s3Key |
|--------|----------|-------------|----------------|
| POST | `/api/spreadsheet-artifact/create` | Create new Excel artifact | No (generates) |
| POST | `/api/spreadsheet-artifact/:id/update` | Update artifact (new version) | Yes (body) |
| GET | `/api/spreadsheet-artifact/:id` | Get parsed data + download URL | Yes (query) |
| GET | `/api/spreadsheet-artifact/:id/versions` | List version history | Yes (query) |
| POST | `/api/spreadsheet-artifact/:id/restore` | Restore previous version | Yes (body) |
| GET | `/api/spreadsheet-artifact/:id/download/:versionId` | Download specific version | Yes (query) |
| DELETE | `/api/spreadsheet-artifact/:id` | Delete artifact and versions | Yes (query) |

**Example: Create Artifact**
```javascript
POST /api/spreadsheet-artifact/create
{
  "title": "Sales Report",
  "headers": ["Product", "Q1", "Q2", "Q3", "Q4"],
  "rows": [
    ["Widget A", 1200, 1350, 1100, 1500],
    ["Widget B", 800, 900, 950, 1000]
  ],
  "conversationId": "conv_123",  // optional
  "messageId": "msg_456"         // optional
}

Response:
{
  "artifactId": "97fd2b07-8035-474f-b846-caa84f46a1df",
  "s3Key": "users/6880e2fd54a7944bf8258904/spreadsheets/97fd2b07-8035-474f-b846-caa84f46a1df.xlsx",
  "versionId": "xvBZQdqWQJB8Nv.Gp9hJZQ9_RQqGLqKH",
  "downloadUrl": "https://s3.amazonaws.com/...",
  "metadata": {
    "rowCount": 2,
    "columnCount": 5,
    "sheetCount": 1
  }
}
```

**Example: Get Artifact with Data**
```javascript
GET /api/spreadsheet-artifact/97fd2b07-8035-474f-b846-caa84f46a1df?s3Key=users/6880e2fd54a7944bf8258904/spreadsheets/97fd2b07-8035-474f-b846-caa84f46a1df.xlsx

Response:
{
  "artifactId": "97fd2b07-8035-474f-b846-caa84f46a1df",
  "s3Key": "users/6880e2fd54a7944bf8258904/spreadsheets/97fd2b07-8035-474f-b846-caa84f46a1df.xlsx",
  "downloadUrl": "https://s3.amazonaws.com/...",
  "headers": ["Product", "Q1", "Q2", "Q3", "Q4"],
  "rows": [
    ["Widget A", 1200, 1350, 1100, 1500],
    ["Widget B", 800, 900, 950, 1000]
  ],
  "metadata": {
    "rowCount": 2,
    "columnCount": 5,
    "sheetCount": 1,
    "currentVersionId": "xvBZQdqWQJB8Nv.Gp9hJZQ9_RQqGLqKH",
    "fileSize": 5834
  },
  "versions": [
    {
      "versionId": "xvBZQdqWQJB8Nv.Gp9hJZQ9_RQqGLqKH",
      "timestamp": 1732647890123,
      "size": 5834,
      "isLatest": true
    }
  ]
}
```

### 3. Frontend Components ✅

#### ExcelSpreadsheetArtifact Component

**File:** `client/src/components/Artifacts/ExcelSpreadsheetArtifact.tsx`

Full-featured spreadsheet viewer with:
- ✅ **Auto-fetch** - Loads data from S3 on component mount using React Query
- ✅ **Table rendering** - Headers, rows, pagination (25/50/100/250/500 rows per page)
- ✅ **Search** - Filter rows by cell content
- ✅ **Sorting** - Click column headers to sort (asc/desc/none)
- ✅ **Export** - Download as Excel (.xlsx), CSV, or JSON
- ✅ **Loading states** - Spinner while fetching from S3
- ✅ **Error handling** - User-friendly error messages
- ✅ **Version info** - Displays current versionId
- ✅ **Responsive** - Scrollable table with sticky headers

**Features:**
```typescript
// Auto-fetches data when artifact is rendered
const { data, isLoading, error } = useSpreadsheetQuery(artifactId, {
  enabled: !!artifactId,
  s3Key,
});

// User interactions
- Search across all cells
- Sort by any column
- Navigate pages
- Download Excel file directly from S3
- Export to CSV/JSON (client-side)
```

#### Type Definitions

**File:** `client/src/common/artifacts.ts`

```typescript
export interface ExcelSpreadsheetArtifact extends Artifact {
  type: 'application/vnd.ms-excel';
  data?: {
    artifactId: string;
    s3Key: string;
    downloadUrl: string;
    headers: string[];
    rows: Array<Array<string | number | boolean | null>>;
    metadata: {
      rowCount: number;
      columnCount: number;
      sheetCount?: number;
      currentVersionId?: string;
      fileSize?: number;
      versions?: Array<{
        versionId: string;
        timestamp: number;
        size: number;
        isLatest: boolean;
      }>;
    };
  };
}
```

#### React Query Hooks

**File:** `client/src/data-provider/SpreadsheetArtifact.ts`

```typescript
// Fetch artifact data
const { data, isLoading, error } = useSpreadsheetQuery(artifactId, {
  enabled: true,
  s3Key: 'users/123/spreadsheets/abc.xlsx',
  versionId: 'optional-version-id'
});

// Create new artifact
const { mutate: createArtifact } = useCreateSpreadsheetMutation();
createArtifact({
  title: 'My Spreadsheet',
  headers: ['A', 'B', 'C'],
  rows: [[1, 2, 3]]
});

// Update existing artifact
const { mutate: updateArtifact } = useUpdateSpreadsheetMutation(artifactId);
updateArtifact({
  headers: ['A', 'B', 'C', 'D'],
  rows: [[1, 2, 3, 4]],
  s3Key: 'users/123/spreadsheets/abc.xlsx'
});

// Get version history
const { data: versions } = useSpreadsheetVersionsQuery(artifactId);

// Restore previous version
const { mutate: restore } = useRestoreVersionMutation(artifactId);
restore({ versionId: 'xyz' });
```

#### Artifact Directive Syntax

**Manual Testing:**

You can manually embed artifact directives in chat messages:

```markdown
:::artifact{type="application/vnd.ms-excel" identifier="sales-report-q4" title="Sales Report Q4"}
{
  "artifactId": "97fd2b07-8035-474f-b846-caa84f46a1df",
  "s3Key": "users/6880e2fd54a7944bf8258904/spreadsheets/97fd2b07-8035-474f-b846-caa84f46a1df.xlsx",
  "downloadUrl": "https://s3.amazonaws.com/presigned-url",
  "headers": ["Product", "Revenue"],
  "rows": [
    ["Widget A", 15000],
    ["Widget B", 12000]
  ]
}
:::
```

**How it works:**
1. Markdown directive is parsed by `artifactPlugin` in `Artifact.tsx`
2. JSON content is parsed and stored in `artifact.data`
3. `ExcelSpreadsheetArtifact` component auto-fetches fresh data from S3 using the `artifactId` and `s3Key`
4. Component displays table with full interactivity

#### Artifact Registration

**File:** `client/src/utils/artifacts.ts`

```typescript
const artifactFilename = {
  'application/vnd.ms-excel': 'Spreadsheet.xlsx',
  // ... other types
};

const artifactTemplate = {
  'application/vnd.ms-excel': 'react-ts',
  // ... other types
};
```

**File:** `client/src/components/Artifacts/ArtifactTabs.tsx`

```typescript
const isExcelSpreadsheet = artifact.type === 'application/vnd.ms-excel';

if (isExcelSpreadsheet) {
  return (
    <>
      <Tabs.Content value="code">
        <ExcelSpreadsheetArtifact artifact={artifact as ExcelArtifact} />
      </Tabs.Content>
      <Tabs.Content value="preview">
        <ExcelSpreadsheetArtifact artifact={artifact as ExcelArtifact} />
      </Tabs.Content>
    </>
  );
}
```

### 4. Data Provider Integration

**Files:**
- `packages/data-provider/src/api-endpoints.ts` - API endpoint URLs
- `packages/data-provider/src/data-service.ts` - Service methods
- `packages/data-provider/src/keys.ts` - React Query cache keys

**Example Service Method:**
```typescript
export function getSpreadsheetArtifact(
  artifactId: string,
  options?: { s3Key?: string; versionId?: string },
): Promise<SpreadsheetArtifactResponse> {
  const query = options
    ? `?${Object.entries(options)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
        .join('&')}`
    : '';
  return request.get(`${endpoints.getSpreadsheetArtifact(artifactId)}${query}`);
}
```

---

## Architecture Highlights

### Data Flow

```
User creates spreadsheet via chat
            ↓
Backend generates Excel file (ExcelService)
            ↓
Upload to S3 with versioning (S3Service)
            ↓
Return: artifactId, s3Key, presigned URL
            ↓
Frontend auto-fetches data on render
            ↓
Display interactive table
```

### Update Flow

```
User requests changes via chat
            ↓
Backend generates updated Excel
            ↓
S3 upload to SAME key (new versionId auto-generated)
            ↓
Return: new versionId, presigned URL
            ↓
Frontend re-fetches and displays
```

### Version Management

S3 native versioning handles all version control automatically:
- ✅ Same S3 key used for all versions of an artifact
- ✅ S3 automatically creates new `versionId` on each upload
- ✅ No manual timestamp management needed
- ✅ Efficient storage (S3 stores deltas)
- ✅ Built-in atomic operations
- ✅ List all versions via `listObjectVersions` API
- ✅ Restore any version by copying it as new latest

### Security Model

```
Client Request with JWT
        ↓
Backend validates JWT → userId
        ↓
Check s3Key starts with: users/{userId}/spreadsheets/
        ↓
Parse Excel from S3
        ↓
Generate presigned URL (1-hour expiry)
        ↓
Return data + downloadUrl
        ↓
Client downloads directly from S3 (no backend proxy)
```

**Key Security Features:**
- ✅ JWT authentication required for all routes
- ✅ User ownership validated via s3Key prefix pattern
- ✅ Presigned URLs expire after 1 hour (configurable)
- ✅ S3 bucket not publicly accessible
- ✅ IAM policies restrict access to authorized operations only

---

## Configuration Setup

### Environment Variables Required

Add to `.env`:

```bash
# AWS S3 (Required)
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_S3_BUCKET=librechat-spreadsheets
AWS_REGION=us-east-1

# Optional Configuration
S3_PRESIGNED_URL_EXPIRY=3600  # Default: 1 hour in seconds
```

### AWS S3 Setup

#### 1. Create S3 Bucket

```bash
aws s3api create-bucket \
  --bucket librechat-spreadsheets \
  --region us-east-1
```

#### 2. Enable Versioning (CRITICAL)

```bash
aws s3api put-bucket-versioning \
  --bucket librechat-spreadsheets \
  --versioning-configuration Status=Enabled
```

**Verify versioning is enabled:**
```bash
aws s3api get-bucket-versioning --bucket librechat-spreadsheets
# Should output: "Status": "Enabled"
```

#### 3. Create IAM User and Policy

**Required S3 Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucketVersions",
        "s3:GetObjectVersion",
        "s3:DeleteObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::librechat-spreadsheets",
        "arn:aws:s3:::librechat-spreadsheets/*"
      ]
    }
  ]
}
```

#### 4. Bucket Lifecycle (Optional - Cost Optimization)

Delete old versions after 90 days:
```json
{
  "Rules": [
    {
      "Id": "DeleteOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    }
  ]
}
```

**See detailed setup guide:** `docs/deployment/S3_SETUP.md`

### Dependencies

Already included in `api/package.json`:
- `@aws-sdk/client-s3@^3.753.0` - S3 client
- `@aws-sdk/lib-storage@^3.758.0` - Multipart uploads
- `exceljs@^4.4.0` - Excel file generation/parsing

### Installation

```bash
cd api
npm install
```

### Verify Setup

**Test S3 Connection:**
```bash
node -e "
const S3Service = require('./api/server/services/Spreadsheet/S3Service');
const s3 = new S3Service();
s3.isVersioningEnabled().then(enabled =>
  console.log('S3 Versioning:', enabled ? '✅ Enabled' : '❌ Disabled')
);
"
```

**Test Excel Generation:**
```bash
node -e "
const ExcelService = require('./api/server/services/Spreadsheet/ExcelService');
const service = new ExcelService();
service.createWorkbook(['A', 'B'], [[1, 2]]).then(() =>
  console.log('✅ ExcelService OK')
);
"
```

---

## Testing the Feature

### Backend API Testing

**1. Create Artifact:**
```bash
curl -X POST http://localhost:3090/api/spreadsheet-artifact/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Spreadsheet",
    "headers": ["Name", "Age", "City"],
    "rows": [
      ["Alice", 30, "NYC"],
      ["Bob", 25, "LA"]
    ]
  }'
```

**2. Get Artifact:**
```bash
curl "http://localhost:3090/api/spreadsheet-artifact/{artifactId}?s3Key=users/{userId}/spreadsheets/{artifactId}.xlsx" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**3. Update Artifact:**
```bash
curl -X POST http://localhost:3090/api/spreadsheet-artifact/{artifactId}/update \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "s3Key": "users/{userId}/spreadsheets/{artifactId}.xlsx",
    "headers": ["Name", "Age", "City", "Country"],
    "rows": [
      ["Alice", 30, "NYC", "USA"],
      ["Bob", 25, "LA", "USA"],
      ["Charlie", 35, "London", "UK"]
    ],
    "changeDescription": "Added Country column"
  }'
```

### Frontend Manual Testing

**1. Embed artifact directive in a chat message:**

```markdown
:::artifact{type="application/vnd.ms-excel" identifier="test-sheet" title="Test Spreadsheet"}
{
  "artifactId": "your-artifact-id",
  "s3Key": "users/your-user-id/spreadsheets/your-artifact-id.xlsx"
}
:::
```

**2. Component auto-fetches data and displays:**
- Interactive table with headers and rows
- Search, sort, pagination controls
- Download Excel/CSV/JSON buttons
- Version information

### Utility Scripts

**Upload CSV to S3 as Excel:**

```bash
node api/scripts/csv-to-excel-s3.js path/to/file.csv
```

This script:
- Reads CSV file
- Converts to Excel format
- Uploads to S3 with versioning
- Outputs artifactId and s3Key for testing

---

## Planned Future Features

### Phase 2: Supabase Metadata Layer (Optional Extension)

**Current Limitation:**

The S3-only implementation works great but lacks:
- Ability to browse all spreadsheets across conversations
- Search and filter capabilities
- Usage analytics and tracking
- Sharing and collaboration features

**Proposed Enhancement: Add Supabase Metadata Storage**

By adding an optional Supabase metadata layer, we can enable:

#### SupabaseService (`api/server/services/Spreadsheet/SupabaseService.js`)

**Methods:**
- `createArtifact(data)` - Store metadata after S3 upload
- `updateArtifact(artifactId, userId, versionId)` - Update current version
- `getArtifact(artifactId, userId)` - Fetch with ownership verification
- `listArtifacts(userId, options)` - Browse user's spreadsheets with pagination
- `updateTitle(artifactId, userId, title)` - Edit artifact titles
- `deleteArtifact(artifactId, userId)` - Remove metadata
- `getArtifactsByConversation(conversationId, userId)` - Filter by conversation

#### Additional API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/spreadsheet-artifact/list/all` | Browse all user's artifacts |
| PATCH | `/api/spreadsheet-artifact/:id/title` | Update artifact title |

#### Database Schema

**Table:** `spreadsheet_artifacts`

```sql
CREATE TABLE spreadsheet_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  s3_key VARCHAR(1000) NOT NULL,
  s3_bucket VARCHAR(255) NOT NULL,
  current_version_id VARCHAR(255),
  sheet_count INTEGER DEFAULT 1,
  row_count INTEGER,
  column_count INTEGER,
  conversation_id VARCHAR(255),
  message_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_spreadsheet_artifacts_user_id ON spreadsheet_artifacts(user_id);
CREATE INDEX idx_spreadsheet_artifacts_conversation_id ON spreadsheet_artifacts(conversation_id);
CREATE INDEX idx_spreadsheet_artifacts_created_at ON spreadsheet_artifacts(created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE spreadsheet_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own artifacts"
  ON spreadsheet_artifacts
  FOR ALL
  USING (auth.uid()::text = user_id);
```

**Migration File:** `api/db/supabase/migrations/001_create_spreadsheet_artifacts.sql`

#### Frontend Enhancements

**New Components:**
- `SpreadsheetBrowser.tsx` - Browse all artifacts with search/filter
- `SpreadsheetGallery.tsx` - Visual gallery view of spreadsheets
- `ShareSpreadsheet.tsx` - Sharing controls (future)

**New Hooks:**
- `useListSpreadsheetsQuery()` - Browse artifacts
- `useUpdateSpreadsheetTitleMutation()` - Edit titles

#### Configuration

**Environment Variables (Optional):**
```bash
# Supabase (optional - enables metadata features)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Supabase Client:**
```javascript
// api/server/utils/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null; // Gracefully degrade to S3-only mode
  }
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = { getSupabaseClient };
```

#### Migration Path

**Backwards Compatible:**
- Existing S3-only installations continue to work
- Routes check if Supabase is configured before using it
- If Supabase unavailable, fallback to s3Key validation
- No breaking changes to API contracts

**Example Hybrid Route:**
```javascript
router.get('/:artifactId', async (req, res) => {
  const { artifactId } = req.params;
  const { s3Key: providedS3Key } = req.query;
  const userId = req.user.id;

  let s3Key;

  // Try Supabase first (if configured)
  if (supabaseService) {
    const artifact = await supabaseService.getArtifact(artifactId, userId);
    if (artifact) {
      s3Key = artifact.s3_key;
    }
  }

  // Fallback to direct s3Key (current behavior)
  if (!s3Key && providedS3Key) {
    s3Key = providedS3Key;
    // Validate ownership
    if (!s3Key.startsWith(`users/${userId}/spreadsheets/`)) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  // Continue with S3 operations...
});
```

#### Benefits Summary

**With Supabase metadata:**
- ✅ Browse all spreadsheets in one place
- ✅ Search by title, conversation, date
- ✅ Track usage analytics
- ✅ Enable sharing/collaboration (future)
- ✅ Faster lookups (no S3 list operations)
- ✅ Rich filtering and sorting

**Without Supabase (current):**
- ✅ Simpler deployment
- ✅ Lower costs
- ✅ Fewer dependencies
- ✅ Direct S3 access

**See setup guide:** `api/db/supabase/README.md` (when implementing)

---

### Phase 3: Advanced Excel Features

#### Multiple Worksheet Support
- Add/delete/rename sheets
- Switch between worksheets in UI
- Cross-sheet references
- Sheet-specific operations

#### Excel Formulas
- Support common formulas (SUM, AVERAGE, COUNT, etc.)
- Formula editing in UI
- Automatic recalculation
- Formula validation

#### Charts and Visualizations
- Bar, line, pie charts
- Embedded in Excel file
- Interactive chart builder in UI
- Export charts as images

#### Advanced Formatting
- Cell styling (font, color, borders)
- Conditional formatting
- Number formatting (currency, percentage, date)
- Column width and row height

#### Data Validation
- Dropdown lists
- Number ranges
- Date restrictions
- Custom validation rules

#### Collaboration Features
- Real-time editing (WebSocket)
- Change tracking
- Comments and annotations
- Share via link with permissions

---

## File Structure Summary

```
api/
├── server/
│   ├── services/
│   │   └── Spreadsheet/
│   │       ├── S3Service.js           ✅ Implemented
│   │       └── ExcelService.js        ✅ Implemented
│   ├── routes/
│   │   ├── spreadsheet-artifact.js    ✅ Implemented (S3-only)
│   │   └── index.js                   ✅ Routes registered
│   ├── utils/
│   │   └── s3Config.js                ✅ Implemented
│   └── index.js                       ✅ Routes loaded
├── scripts/
│   └── csv-to-excel-s3.js             ✅ Utility script
├── package.json                       ✅ Dependencies added
└── .env                               ✅ S3 config required

client/
├── src/
│   ├── components/
│   │   └── Artifacts/
│   │       ├── ExcelSpreadsheetArtifact.tsx  ✅ Implemented
│   │       ├── Artifact.tsx                  ✅ Updated (JSON parsing)
│   │       └── ArtifactTabs.tsx              ✅ Updated (routing)
│   ├── data-provider/
│   │   └── SpreadsheetArtifact.ts            ✅ React Query hooks
│   ├── hooks/
│   │   └── useStreamingArtifact.ts           ✅ createExcelArtifact method
│   ├── common/
│   │   └── artifacts.ts                      ✅ Type definitions
│   └── utils/
│       └── artifacts.ts                      ✅ Artifact registration

packages/
└── data-provider/
    └── src/
        ├── api-endpoints.ts           ✅ Endpoint definitions
        ├── data-service.ts            ✅ Service methods
        └── keys.ts                    ✅ Cache keys

docs/
├── features/
│   └── SPREADSHEET_ARTIFACTS.md       ✅ This file
└── deployment/
    └── S3_SETUP.md                    ✅ S3 setup guide
```

**Future (Phase 2 - Supabase):**
```
api/
├── server/
│   ├── services/
│   │   └── Spreadsheet/
│   │       └── SupabaseService.js     ⏳ Future
│   └── utils/
│       └── supabaseClient.js          ⏳ Future
└── db/
    └── supabase/
        ├── migrations/
        │   └── 001_create_spreadsheet_artifacts.sql  ⏳ Future
        └── README.md                  ⏳ Future
```

---

## Success Criteria Met ✅

### Backend
- ✅ S3Service with native versioning
- ✅ ExcelService with ExcelJS integration
- ✅ Complete API routes (7 endpoints)
- ✅ JWT authentication and authorization
- ✅ S3 key pattern validation
- ✅ Configuration utilities
- ✅ Dependencies added and installed
- ✅ Routes registered and tested

### Frontend
- ✅ ExcelSpreadsheetArtifact component
- ✅ React Query integration with auto-fetch
- ✅ Interactive table with search, sort, pagination
- ✅ Export to Excel/CSV/JSON
- ✅ Loading and error states
- ✅ Artifact type registration
- ✅ Type definitions
- ✅ Directive parsing and rendering

### Documentation
- ✅ Feature implementation docs (this file)
- ✅ S3 setup guide
- ✅ API examples and testing instructions
- ✅ Frontend integration guide

**Status: Production Ready!** 🚀

Both backend and frontend are fully implemented and tested. The S3-only architecture is simple, secure, and ready for deployment.

---

## Troubleshooting

### Common Issues

**"S3 client not initialized"**
- ✅ Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`
- ✅ Check IAM permissions include all required S3 operations
- ✅ Restart application after adding environment variables

**"Versioning not working"**
- ✅ Ensure S3 bucket has versioning enabled
- ✅ Run: `aws s3api get-bucket-versioning --bucket librechat-spreadsheets`
- ✅ Should show: `"Status": "Enabled"`

**"Access Denied (403)"**
- ✅ Check IAM policy includes all required S3 permissions
- ✅ Verify bucket policy doesn't block access
- ✅ Ensure s3Key matches user's JWT userId

**"Failed to load spreadsheet"**
- ✅ Check browser console for error details
- ✅ Verify s3Key is correct and file exists in S3
- ✅ Ensure presigned URL hasn't expired (1-hour limit)
- ✅ Check backend logs for parsing errors

**"dataService.getSpreadsheetArtifact is not a function"**
- ✅ Rebuild data-provider package: `npm run build --workspace=librechat-data-provider`
- ✅ Restart frontend development server

### Debug Logging

Enable debug logging to see detailed operation logs:

```bash
DEBUG=librechat:* npm run backend
```

Check logs for:
- `[S3Service]` - S3 upload/download operations
- `[ExcelService]` - Excel generation and parsing
- `[SpreadsheetArtifact]` - API route handling
- `[Auth]` - JWT validation

### Verify S3 Bucket Configuration

```bash
# Check versioning status
aws s3api get-bucket-versioning --bucket librechat-spreadsheets

# List all objects and versions
aws s3api list-object-versions --bucket librechat-spreadsheets

# Test presigned URL generation
node -e "
const S3Service = require('./api/server/services/Spreadsheet/S3Service');
const s3 = new S3Service();
const url = await s3.getPresignedUrl('test-key', null, 60);
console.log('Presigned URL:', url);
"
```

---

## Cost Estimates

### AWS S3 Pricing (us-east-1, as of 2024)

**Storage:**
- First 50 TB: $0.023 per GB/month
- Example: 10,000 spreadsheets × 50 KB avg = 500 MB ≈ $0.01/month

**Requests:**
- PUT (uploads): $0.005 per 1,000 requests
- GET (downloads): $0.0004 per 1,000 requests
- Example: 1,000 uploads + 5,000 downloads = $0.007/month

**Data Transfer:**
- First 100 GB out: Free
- Next 9.999 TB: $0.09 per GB

**Versioning:**
- Each version stored as separate object (charged at storage rate)
- Lifecycle policies can auto-delete old versions to control costs

**Total Estimate for Small Deployment:**
- **~$1-5/month** for typical usage (< 10,000 spreadsheets, moderate activity)

---

## Contributors

Implementation follows LibreChat's architectural patterns and coding standards.

**Current Status:**
- ✅ Backend services (S3, Excel)
- ✅ API routes with authentication
- ✅ Frontend components and hooks
- ✅ Configuration and documentation
- ✅ **Production Ready**

**Future Enhancements:**
- ⏳ Supabase metadata layer (Phase 2)
- ⏳ Advanced Excel features (Phase 3)
- ⏳ Collaboration features (Phase 3)

---

## Additional Resources

- [AWS S3 Versioning Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [ExcelJS Library Documentation](https://github.com/exceljs/exceljs)
- [React Query Documentation](https://tanstack.com/query/latest)
- [LibreChat Documentation](https://docs.librechat.ai)

**Internal Guides:**
- `docs/deployment/S3_SETUP.md` - Detailed S3 configuration
- `api/db/supabase/README.md` - Supabase setup (when Phase 2 implemented)

---

**Last Updated:** November 26, 2024
**Status:** ✅ Production Ready (S3-Only Architecture)
**Next Phase:** Supabase Metadata Layer (Optional)

/**
 * backfillBadgeCacheControl.js
 *
 * One-time backfill: re-writes every badge image in R2 (assets/badges/*.png)
 * with `Cache-Control: no-cache` so browsers revalidate via ETag instead of
 * serving stale copies. R2 has no in-place metadata edit, so we CopyObject each
 * key onto itself with MetadataDirective: 'REPLACE'. URLs are unchanged.
 *
 * Safe to re-run (idempotent). Uses the same R2 env vars as api/index.js.
 *
 * Usage:
 *   node api/scripts/backfillBadgeCacheControl.js
 *   node api/scripts/backfillBadgeCacheControl.js --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');

const DRY_RUN = process.argv.includes('--dry-run');

const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME       = process.env.R2_BUCKET_NAME || 'shiny-sprites';
const PREFIX               = 'assets/badges/';

async function main() {
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) {
    console.error('Missing R2 credentials in api/.env'); process.exit(1);
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  console.log(`Bucket: ${R2_BUCKET_NAME}  Prefix: ${PREFIX}\n`);

  let ContinuationToken;
  let scanned = 0, updated = 0, failed = 0;

  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: PREFIX,
      ContinuationToken,
    }));

    for (const obj of list.Contents || []) {
      const Key = obj.Key;
      if (!Key.toLowerCase().endsWith('.png')) continue;
      scanned++;

      if (DRY_RUN) { console.log(`would update: ${Key}`); updated++; continue; }

      try {
        await s3.send(new CopyObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key,
          CopySource: `${R2_BUCKET_NAME}/${encodeURIComponent(Key)}`,
          MetadataDirective: 'REPLACE', // REPLACE drops old metadata, so re-set both
          ContentType: 'image/png',
          CacheControl: 'no-cache',
        }));
        console.log(`updated: ${Key}`);
        updated++;
      } catch (err) {
        console.error(`FAILED: ${Key} — ${err.message}`);
        failed++;
      }
    }

    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);

  console.log(`\nScanned ${scanned} PNG object(s). Updated ${updated}. Failed ${failed}.`);
}

main().catch(err => { console.error(err); process.exit(1); });

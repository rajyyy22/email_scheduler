import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email();

export interface CsvParseResult {
  validEmails: string[];
  totalDetected: number;
  validCount: number;
  invalidCount: number;
  duplicatesRemoved: number;
}

export class CsvParserService {
  /**
   * Parses a CSV Buffer or Stream, detecting emails in named columns or single column lines.
   * Deduplicates case-insensitively while preserving first-seen ordering.
   */
  public static async parseCsv(buffer: Buffer): Promise<CsvParseResult> {
    return new Promise((resolve, reject) => {
      const stream = Readable.from(buffer);
      const seenEmails = new Set<string>();
      const validEmails: string[] = [];
      let totalDetected = 0;
      let invalidCount = 0;
      let duplicatesRemoved = 0;

      stream
        .pipe(
          csvParser({
            mapHeaders: ({ header }) => header.trim().toLowerCase(),
          }),
        )
        .on('data', (row: Record<string, string>) => {
          // Look for common email headers or scan values
          let candidate =
            row['email'] ||
            row['email_address'] ||
            row['emailaddress'] ||
            row['recipient'] ||
            row['lead'] ||
            Object.values(row)[0];

          if (candidate) {
            totalDetected++;
            candidate = candidate.trim().toLowerCase();

            const parsed = emailSchema.safeParse(candidate);
            if (parsed.success) {
              const email = parsed.data;
              if (seenEmails.has(email)) {
                duplicatesRemoved++;
              } else {
                seenEmails.add(email);
                validEmails.push(email);
              }
            } else {
              invalidCount++;
            }
          }
        })
        .on('end', () => {
          resolve({
            validEmails,
            totalDetected,
            validCount: validEmails.length,
            invalidCount,
            duplicatesRemoved,
          });
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  /**
   * Helper to normalize a list of raw email strings from JSON requests.
   */
  public static normalizeEmailList(rawEmails: string[]): CsvParseResult {
    const seenEmails = new Set<string>();
    const validEmails: string[] = [];
    let totalDetected = 0;
    let invalidCount = 0;
    let duplicatesRemoved = 0;

    for (let candidate of rawEmails) {
      if (!candidate) continue;
      totalDetected++;
      candidate = candidate.trim().toLowerCase();
      const parsed = emailSchema.safeParse(candidate);
      if (parsed.success) {
        const email = parsed.data;
        if (seenEmails.has(email)) {
          duplicatesRemoved++;
        } else {
          seenEmails.add(email);
          validEmails.push(email);
        }
      } else {
        invalidCount++;
      }
    }

    return {
      validEmails,
      totalDetected,
      validCount: validEmails.length,
      invalidCount,
      duplicatesRemoved,
    };
  }
}

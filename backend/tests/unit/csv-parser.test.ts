import { describe, it, expect } from 'vitest';
import { CsvParserService } from '../../src/modules/campaigns/csv-parser.service.js';

describe('CsvParserService', () => {
  it('should parse valid CSV buffer and normalize emails', async () => {
    const csvContent = `email,name
test1@example.com,John
TEST2@EXAMPLE.COM,Jane
invalid-email,Bob
test1@example.com,John Duplicate
`;
    const buffer = Buffer.from(csvContent, 'utf8');
    const result = await CsvParserService.parseCsv(buffer);

    expect(result.validCount).toBe(2);
    expect(result.validEmails).toEqual(['test1@example.com', 'test2@example.com']);
    expect(result.invalidCount).toBe(1);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('should handle raw list of emails with duplicates and bad syntax', () => {
    const rawList = [
      '  USER@DOMAIN.COM  ',
      'user@domain.com',
      'not-an-email',
      '',
      'lead@reachinbox.ai',
    ];

    const result = CsvParserService.normalizeEmailList(rawList);

    expect(result.validCount).toBe(2);
    expect(result.validEmails).toEqual(['user@domain.com', 'lead@reachinbox.ai']);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.invalidCount).toBe(1);
  });
});

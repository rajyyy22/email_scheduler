import { describe, it, expect } from 'vitest';
import { SmtpDispatcherService } from '../../src/services/smtp-dispatcher.service.js';

describe('SmtpDispatcherService Error Classification', () => {
  it('should classify timeout and connection errors as TRANSIENT', () => {
    const errTimeout = { code: 'ETIMEDOUT', message: 'Connection timed out' };
    const errReset = { code: 'ECONNRESET', message: 'Connection reset by peer' };
    const err421 = { responseCode: 421, message: '4.2.1 Service not available' };

    expect(SmtpDispatcherService.classifyError(errTimeout).classification).toBe('TRANSIENT');
    expect(SmtpDispatcherService.classifyError(errReset).classification).toBe('TRANSIENT');
    expect(SmtpDispatcherService.classifyError(err421).classification).toBe('TRANSIENT');
  });

  it('should classify 5xx errors as PERMANENT', () => {
    const err550 = { responseCode: 550, message: '5.1.1 User unknown' };
    const err554 = { responseCode: 554, message: 'Transaction failed' };

    expect(SmtpDispatcherService.classifyError(err550).classification).toBe('PERMANENT');
    expect(SmtpDispatcherService.classifyError(err554).classification).toBe('PERMANENT');
  });

  it('should classify unrecognized errors as UNKNOWN', () => {
    const errGeneric = { message: 'Some weird unexpected error' };
    expect(SmtpDispatcherService.classifyError(errGeneric).classification).toBe('UNKNOWN');
  });
});

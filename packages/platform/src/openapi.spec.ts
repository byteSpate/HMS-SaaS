import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openApiSchema } from './openapi.js';

describe('openApiSchema', () => {
  const contract = z.object({
    username: z.string().trim().min(1),
    at: z.iso.datetime().nullable(),
    count: z.number().int().optional(),
  });

  it('turns a contract into an OpenAPI 3.0 schema with required fields', () => {
    const schema = openApiSchema(contract, 'input') as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['username', 'at']);
    expect(schema).not.toHaveProperty('$schema');
  });

  it('keeps date-time as a format and drops its long pattern', () => {
    const schema = openApiSchema(contract) as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(schema.properties.at).toMatchObject({ format: 'date-time', nullable: true });
    expect(schema.properties.at).not.toHaveProperty('pattern');
  });
});

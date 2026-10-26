import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEtsyObservation} from '../dist/js/provider.js';

test('normalizes verified Etsy supply without inventing demand', () => {
  const value = normalizeEtsyObservation({
    totalListings:321,
    prices:[12, 8, 10],
    sampleSize:3,
    digitalSampleSize:2,
    fetchedAt:'2026-10-26T10:00:00.000Z',
    market:'US'
  });
  assert.equal(value.listings, 321);
  assert.equal(value.price, 10);
  assert.equal(value.demand, null);
  assert.equal(value.trend, null);
  assert.equal(value.sourceLabel, 'Official Etsy Open API');
});

import assert from 'node:assert/strict';
import test from 'node:test';

const { addItem, updateItem, create } = await import('../src/modules/templates/templates.schemas.js');
const picture = 'https://example.com/chips.png';

test('an item with a picture needs a description', () => {
  assert.equal(addItem.safeParse({ name: 'Chips', imageUrl: picture }).success, false);
  assert.equal(addItem.safeParse({ name: 'Chips', imageUrl: picture, altText: '  ' }).success, false);
  assert.ok(addItem.safeParse({ name: 'Chips', imageUrl: picture, altText: 'A bag of chips' }).success);
});

test('a text-only item needs no description', () => {
  assert.ok(addItem.safeParse({ name: 'Chips' }).success);
  assert.ok(addItem.safeParse({ name: 'Chips', imageUrl: null }).success);
});

test('the same rule applies to the items sent when a template is created', () => {
  const base = { title: 'Snacks' };
  assert.equal(create.safeParse({ ...base, items: [{ name: 'Chips', imageUrl: picture }] }).success, false);
  assert.ok(create.safeParse({ ...base, items: [{ name: 'Chips', imageUrl: picture, altText: 'Chips' }, { name: 'Soda' }] }).success);
});

test('editing an item: a new picture needs a description, a rename does not', () => {
  assert.equal(updateItem.safeParse({ imageUrl: picture }).success, false);
  assert.ok(updateItem.safeParse({ imageUrl: picture, altText: 'A bag of chips' }).success);
  assert.ok(updateItem.safeParse({ name: 'Crisps' }).success);
  assert.ok(updateItem.safeParse({ imageUrl: null }).success);
  assert.equal(updateItem.safeParse({}).success, false);
});

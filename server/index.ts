import express from 'express';
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
import type { SalesMappingField } from '../src/types/salesMapping.ts';
import type { CategoryField } from '../src/types/categoryMapping.ts';

const app = express();
app.use(express.json());

const NONE_OF_THESE = 'none_of_these';

const FIELD_INSTRUCTIONS: Record<SalesMappingField, string> = {
  item_id: 'Which column contains the item/product identifier (SKU, product ID, item code)?',
  sales_qty: 'Which column contains the quantity sold in each sales record?',
  sales_date: 'Which column contains the date each sale occurred?',
};

const CATEGORY_CRITERIA: Record<CategoryField, string> = {
  furniture: 'Furniture — items used to furnish a room, e.g. chairs, tables, sofas, beds, shelves.',
  vehicles: 'Vehicles — modes of transportation, e.g. cars, trucks, motorcycles, bicycles.',
  vegetables: 'Vegetables — edible plant-based food items, e.g. cucumber, carrot, onion.',
  electronics: 'Electronics — electronic devices and gadgets, e.g. phones, laptops, TVs.',
};

// TypeSafeClient's constructor throws if TYPESAFE_API_KEY is unset, so it's
// constructed lazily on first request rather than at module load — this lets
// the server start before the user has added their key.
let client: TypeSafeClient | null = null;

function getClient(): TypeSafeClient {
  if (!client) {
    client = new TypeSafeClient();
  }
  return client;
}

app.post('/api/match-columns', async (req, res) => {
  const headers: unknown = req.body?.headers;
  if (!Array.isArray(headers) || !headers.every((h) => typeof h === 'string') || headers.length === 0) {
    res.status(400).json({ error: 'headers must be a non-empty string array' });
    return;
  }

  const criteria: Record<string, null> = { [NONE_OF_THESE]: null };
  for (const h of headers) criteria[h] = null;

  try {
    const response = await getClient().systemOne({
      state: { headers },
      questions: {
        item_id: choice(FIELD_INSTRUCTIONS.item_id, criteria),
        sales_qty: choice(FIELD_INSTRUCTIONS.sales_qty, criteria),
        sales_date: choice(FIELD_INSTRUCTIONS.sales_date, criteria),
      },
    });
    const toResult = (c: string) => (c === NONE_OF_THESE ? null : c);
    res.json({
      item_id: toResult(response.answers.item_id.choice),
      sales_qty: toResult(response.answers.sales_qty.choice),
      sales_date: toResult(response.answers.sales_date.choice),
    });
  } catch (err) {
    console.error('match-columns failed:', err);
    res.status(502).json({ error: 'Failed to match columns' });
  }
});

app.post('/api/classify-category', async (req, res) => {
  const items: unknown = req.body?.items;
  if (!Array.isArray(items) || !items.every((i) => typeof i === 'string') || items.length === 0) {
    res.status(400).json({ error: 'items must be a non-empty string array' });
    return;
  }

  const criteria: Record<string, string | null> = { ...CATEGORY_CRITERIA, [NONE_OF_THESE]: null };

  try {
    const client = getClient();
    const entries = await Promise.all(
      items.map(async (item) => {
        const response = await client.systemOne({
          state: { item },
          questions: {
            category: choice('Which category best describes this item?', criteria),
          },
        });
        const c = response.answers.category.choice;
        return [item, c === NONE_OF_THESE ? null : (c as CategoryField)] as const;
      }),
    );
    res.json({ categories: Object.fromEntries(entries) });
  } catch (err) {
    console.error('classify-category failed:', err);
    res.status(502).json({ error: 'Failed to classify items' });
  }
});

app.post('/api/lookup-match', async (req, res) => {
  const values: unknown = req.body?.values;
  const candidates: unknown = req.body?.candidates;
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'string') || values.length === 0) {
    res.status(400).json({ error: 'values must be a non-empty string array' });
    return;
  }
  if (!Array.isArray(candidates) || !candidates.every((c) => typeof c === 'string') || candidates.length === 0) {
    res.status(400).json({ error: 'candidates must be a non-empty string array' });
    return;
  }

  const criteria: Record<string, null> = { [NONE_OF_THESE]: null };
  for (const c of candidates) criteria[c] = null;

  try {
    const client = getClient();
    const entries = await Promise.all(
      values.map(async (value) => {
        const response = await client.systemOne({
          state: { value },
          questions: {
            match: choice('Which of these lookup keys best matches this value?', criteria),
          },
        });
        const c = response.answers.match.choice;
        return [value, c === NONE_OF_THESE ? null : c] as const;
      }),
    );
    res.json({ matches: Object.fromEntries(entries) });
  } catch (err) {
    console.error('lookup-match failed:', err);
    res.status(502).json({ error: 'Failed to match lookup values' });
  }
});

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => console.log(`TypeSafe server listening on :${PORT}`));

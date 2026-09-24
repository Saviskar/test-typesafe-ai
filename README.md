# TypeSafe AI CLI

A CLI for testing how well TypeSafe AI's Jev model performs on three judgments:
sales-column mapping, item categorization, and fuzzy lookup matching.

## Setup

```sh
pip install -r requirements.txt
cp .env.example .env   # then fill in TYPESAFE_API_KEY
```

## Usage

**Map sales columns** — detect which CSV columns are the item ID, quantity, and date:

```sh
python cli.py map-sales samples/sales.csv
```

**Classify items into categories** (furniture / vehicles / vegetables / electronics):

```sh
python cli.py classify-category samples/items.csv --column item_name
```

**Fuzzy lookup match** — match messy source values against a lookup table:

```sh
python cli.py lookup-match samples/lookup_source.csv --key-column item \
    --lookup samples/lookup_candidates.csv --lookup-key name --lookup-value price
```

Each command prints its result to stdout and writes an output CSV next to the
input file (`<name>_mapped.csv`, `<name>_categorized.csv`, `<name>_matched.csv`).

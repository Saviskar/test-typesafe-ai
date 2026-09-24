"""CLI for testing TypeSafe AI's Jev model against three use cases:
sales-column mapping, item categorization, and fuzzy lookup matching.

Usage:
    python cli.py map-sales samples/sales.csv
    python cli.py classify-category samples/items.csv --column item_name
    python cli.py lookup-match samples/lookup_source.csv --key-column item \\
        --lookup samples/lookup_candidates.csv --lookup-key name --lookup-value price
"""

import argparse
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

from tasks import classify_categories, lookup_match, match_sales_columns

# Canonical column names the sales-mapping output is normalized to, regardless
# of what the source CSV called them.
SALES_FIELDS = ["item_id", "sales_qty", "sales_date"]


def output_path(input_csv: Path, suffix: str) -> Path:
    """Build a sibling output filename, e.g. sales.csv -> sales_mapped.csv."""
    return input_csv.with_name(f"{input_csv.stem}_{suffix}.csv")


def cmd_map_sales(args: argparse.Namespace) -> None:
    """`map-sales`: detect which input columns are item_id/sales_qty/sales_date
    and write a copy of the CSV with those columns renamed to SALES_FIELDS.

    The AI judgment itself lives in tasks.match_sales_columns; this function
    just handles reading the CSV, reporting the mapping, and writing output.
    """
    csv_path = Path(args.csv)
    df = pd.read_csv(csv_path)

    mapping = match_sales_columns(df)
    print("Detected mapping:")
    for field in SALES_FIELDS:
        print(f"  {field}: {mapping[field] or '(no match)'}")

    if not all(mapping[field] for field in SALES_FIELDS):
        print("\nCouldn't map every field — skipping output file.")
        return

    out_df = df[[mapping[f] for f in SALES_FIELDS]].copy()
    out_df.columns = SALES_FIELDS
    out_file = output_path(csv_path, "mapped")
    out_df.to_csv(out_file, index=False)
    print(f"\nWrote {out_file}")


def cmd_classify_category(args: argparse.Namespace) -> None:
    """`classify-category`: classify each unique value in --column into one of
    tasks.CATEGORY_CRITERIA, then write the CSV back out with a new
    'category' column.
    """
    csv_path = Path(args.csv)
    df = pd.read_csv(csv_path)
    if args.column not in df.columns:
        raise SystemExit(f"Column '{args.column}' not found in {csv_path} (columns: {list(df.columns)})")

    # Classify only the distinct values once, then map back onto every row.
    items = df[args.column].dropna().unique().tolist()
    categories = classify_categories(items)

    print("Classified items:")
    counts: dict[str, int] = {}
    for item, category in categories.items():
        label = category or "(none)"
        counts[label] = counts.get(label, 0) + 1
        print(f"  {item}: {label}")
    print("\nCounts:")
    for label, count in sorted(counts.items()):
        print(f"  {label}: {count}")

    df["category"] = df[args.column].map(categories)
    out_file = output_path(csv_path, "categorized")
    df.to_csv(out_file, index=False)
    print(f"\nWrote {out_file}")


def _output_column_name(source_headers: list[str], lookup_value_column: str) -> str:
    """Pick a name for the new result column that won't clobber an existing
    source column (falls back to '<value column>_lookup', then 'lookup_result').
    """
    if lookup_value_column not in source_headers:
        return lookup_value_column
    return f"{lookup_value_column}_lookup" if "lookup_result" in source_headers else "lookup_result"


def cmd_lookup_match(args: argparse.Namespace) -> None:
    """`lookup-match`: fuzzy VLOOKUP. For each value in the source CSV's
    --key-column, find the best-matching row in the --lookup table (matched
    on --lookup-key) and pull its --lookup-value into a new output column.
    """
    source_path = Path(args.csv)
    source_df = pd.read_csv(source_path)
    lookup_df = pd.read_csv(args.lookup)

    for col, df, label in [
        (args.key_column, source_df, source_path),
        (args.lookup_key, lookup_df, args.lookup),
        (args.lookup_value, lookup_df, args.lookup),
    ]:
        if col not in df.columns:
            raise SystemExit(f"Column '{col}' not found in {label} (columns: {list(df.columns)})")

    # Match only the distinct values once; lookup_match does the fuzzy AI matching.
    values = source_df[args.key_column].dropna().unique().tolist()
    candidates = lookup_df[args.lookup_key].dropna().unique().tolist()
    matches = lookup_match(values, candidates)

    value_to_result = lookup_df.set_index(args.lookup_key)[args.lookup_value].to_dict()
    output_column = _output_column_name(list(source_df.columns), args.lookup_value)

    matched, unmatched = 0, 0

    def resolve(key: str) -> str | None:
        # Two-step lookup: source value -> matched lookup key (via AI) -> lookup value.
        nonlocal matched, unmatched
        matched_key = matches.get(key)
        result = value_to_result.get(matched_key) if matched_key else None
        if result is not None:
            matched += 1
        else:
            unmatched += 1
        return result

    source_df[output_column] = source_df[args.key_column].map(resolve)

    print(f"Matched {matched} of {matched + unmatched} rows")
    out_file = output_path(source_path, "matched")
    source_df.to_csv(out_file, index=False)
    print(f"Wrote {out_file}")


def build_parser() -> argparse.ArgumentParser:
    """Wire up the three subcommands (map-sales, classify-category,
    lookup-match) to their cmd_* handlers above."""
    parser = argparse.ArgumentParser(description="Test TypeSafe AI's Jev model against sample CSV data.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    map_sales = subparsers.add_parser("map-sales", help="Auto-map sales columns (item_id/sales_qty/sales_date)")
    map_sales.add_argument("csv")
    map_sales.set_defaults(func=cmd_map_sales)

    classify_category = subparsers.add_parser("classify-category", help="Classify items into categories")
    classify_category.add_argument("csv")
    classify_category.add_argument("--column", required=True, help="Column containing item names")
    classify_category.set_defaults(func=cmd_classify_category)

    lookup = subparsers.add_parser("lookup-match", help="Fuzzy VLOOKUP: match source values against a lookup table")
    lookup.add_argument("csv", help="Source CSV")
    lookup.add_argument("--key-column", required=True, help="Column in the source CSV to match")
    lookup.add_argument("--lookup", required=True, help="Lookup table CSV")
    lookup.add_argument("--lookup-key", required=True, help="Key column in the lookup table")
    lookup.add_argument("--lookup-value", required=True, help="Value column to pull from the lookup table")
    lookup.set_defaults(func=cmd_lookup_match)

    return parser


def main() -> None:
    """Entry point: load TypeSafe API credentials from .env, parse argv, and
    dispatch to whichever cmd_* function the chosen subcommand set as args.func."""
    load_dotenv()
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

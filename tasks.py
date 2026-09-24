"""TypeSafe AI judgments used by the CLI.

Instructions and criteria are ported verbatim from the original server
(server/index.ts) so results are directly comparable to the earlier UI-backed
version.
"""

import pandas as pd
from typesafe_sdk import Choice, TypeSafeClient

# Sentinel criterion offered alongside the real choices so the model can say
# "none of the above" instead of being forced to pick a wrong answer.
NONE_OF_THESE = "none_of_these"

# One TypeSafe `Choice` question per target field, asked in a single system_one
# call. The criteria (candidate CSV headers) are injected per-call in
# match_sales_columns since they depend on the input file.
FIELD_INSTRUCTIONS = {
    "item_id": "Which column contains the item/product identifier (SKU, product ID, item code)?",
    "sales_qty": "Which column contains the quantity sold in each sales record?",
    "sales_date": "Which column contains the date each sale occurred?",
}

# Fixed category taxonomy for classify_categories. Add/remove entries here to
# change what the classifier can output.
CATEGORY_CRITERIA = {
    "furniture": "Furniture — items used to furnish a room, e.g. chairs, tables, sofas, beds, shelves.",
    "vehicles": "Vehicles — modes of transportation, e.g. cars, trucks, motorcycles, bicycles.",
    "vegetables": "Vegetables — edible plant-based food items, e.g. cucumber, carrot, onion.",
    "electronics": "Electronics — electronic devices and gadgets, e.g. phones, laptops, TVs.",
}


def _resolve(choice: str) -> str | None:
    """Turn the NONE_OF_THESE sentinel back into None for callers."""
    return None if choice == NONE_OF_THESE else choice


def _group_key_column(df: pd.DataFrame) -> str | None:
    """Guess which column is a repeating identifier (e.g. item_id), without
    knowing the schema in advance: among columns that repeat at all (more
    than one distinct value, but not a distinct value on every row), pick
    the one with the fewest distinct values. Returns None if nothing repeats.
    """
    row_count = len(df)
    repeating = [c for c in df.columns if 1 < df[c].nunique(dropna=True) < row_count]
    if not repeating:
        return None
    return min(repeating, key=lambda c: df[c].nunique(dropna=True))


def _group_constancy_evidence(df: pd.DataFrame) -> dict[str, str]:
    """For each column (other than the detected group key), describe — in
    code, not via the AI — whether its values stay constant or vary across
    rows that share the same group-key value. Constant within a group looks
    like a fixed per-item setting (e.g. reorder_level); varying looks like a
    per-transaction/event value (e.g. qty). Runs the same way regardless of
    which target field is being matched.
    """
    group_col = _group_key_column(df)
    if group_col is None:
        return {}
    grouped = df.groupby(group_col)
    evidence = {}
    for col in df.columns:
        if col == group_col:
            continue
        constant = grouped[col].nunique(dropna=True).le(1).all()
        behavior = "stays constant" if constant else "varies"
        looks_like = "a per-item setting" if constant else "a per-transaction/event value"
        evidence[col] = (
            f"When rows are grouped by repeated '{group_col}' values, '{col}' {behavior} "
            f"within each group — looks like {looks_like}."
        )
    return evidence


def match_sales_columns(df: pd.DataFrame) -> dict[str, str | None]:
    """Map each field in FIELD_INSTRUCTIONS to the best-matching column of df.

    Every column is offered as a criterion for every field (plus
    NONE_OF_THESE), annotated with real sample values and, where available,
    code-computed evidence of whether it looks like a constant per-item
    setting or a varying per-transaction value (_group_constancy_evidence) —
    pure pandas, no AI. A few sample rows are also included in state. All
    three fields are asked about in one system_one call so the model can
    consider them together.

    Returns e.g. {"item_id": "sku", "sales_qty": "qty", "sales_date": None}.
    """
    headers = list(df.columns)
    behavior = _group_constancy_evidence(df)

    def describe(header: str) -> dict[str, object]:
        description: dict[str, object] = {
            "sample_values": [str(v) for v in df[header].dropna().head(3).tolist()],
        }
        if header in behavior:
            description["evidence"] = behavior[header]
        return description

    criteria = {NONE_OF_THESE: None, **{h: describe(h) for h in headers}}
    with TypeSafeClient() as client:
        response = client.system_one(
            state={
                "headers": headers,
                "sample_rows": df.head(5).astype(str).to_dict(orient="records"),
            },
            questions={
                field: Choice(instructions=instructions, criteria=criteria)
                for field, instructions in FIELD_INSTRUCTIONS.items()
            },
        )
    return {field: _resolve(response.choices[field].choice) for field in FIELD_INSTRUCTIONS}


def classify_categories(items: list[str]) -> dict[str, str | None]:
    """Classify each item into one of CATEGORY_CRITERIA (or None).

    Issues one system_one call per item rather than batching them together,
    since each item is judged independently against the fixed taxonomy.
    """
    criteria = {**CATEGORY_CRITERIA, NONE_OF_THESE: None}
    results: dict[str, str | None] = {}
    with TypeSafeClient() as client:
        for item in items:
            response = client.system_one(
                state={"item": item},
                questions={
                    "category": Choice(
                        instructions="Which category best describes this item?",
                        criteria=criteria,
                    ),
                },
            )
            results[item] = _resolve(response.choices["category"].choice)
    return results


def lookup_match(values: list[str], candidates: list[str]) -> dict[str, str | None]:
    """Fuzzy-match each value to the closest candidate string (or None).

    This is the "fuzzy VLOOKUP" building block: candidates come from the
    lookup table's key column, and the caller (cli.py) resolves each match
    back to the lookup table's value column.
    """
    criteria = {NONE_OF_THESE: None, **{c: None for c in candidates}}
    results: dict[str, str | None] = {}
    with TypeSafeClient() as client:
        for value in values:
            response = client.system_one(
                state={"value": value},
                questions={
                    "match": Choice(
                        instructions="Which of these lookup keys best matches this value?",
                        criteria=criteria,
                    ),
                },
            )
            results[value] = _resolve(response.choices["match"].choice)
    return results
